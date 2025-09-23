const https = require('https');
const fs = require('fs');
const path = require('path');

class NetSuiteDownloader {
    constructor(config) {
        this.config = config;
        this.validateConfig();
    }
    
    validateConfig() {
        const required = ['accountId', 'consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret', 'restletUrl'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }
    }
    
    async downloadTodaysDueDateLogs() {
        try {
            const today = new Date().toISOString().split('T')[0];
            console.log(`Downloading Due Date logs for date: ${today}`);
            
            const requestBody = {
                action: 'downloadLogs',
                date: today
            };
            
            console.log('Calling NetSuite RESTlet...');
            const response = await this.makeNetSuiteRequest(requestBody);
            
            if (!response.success) {
                throw new Error(`NetSuite RESTlet error: ${response.message}`);
            }
            
            console.log(`NetSuite response: ${response.message}`);
            
            const logFiles = [];
            const logsDir = path.join(process.cwd(), 'logs');
            
            // Ensure logs directory exists
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            if (response.logFiles && response.logFiles.length > 0) {
                for (const logData of response.logFiles) {
                    const fileName = `dueDateLogs-${today}.txt`;
                    const filePath = path.join(logsDir, fileName);
                    
                    // Write log content to file
                    fs.writeFileSync(filePath, logData.content, 'utf8');
                    
                    logFiles.push({
                        name: fileName,
                        path: filePath,
                        type: 'duedate',
                        size: logData.size || logData.content.length,
                        modified: today
                    });
                    
                    console.log(`Saved: ${fileName} (${logData.size || logData.content.length} bytes)`);
                }
            } else {
                console.log('No Due Date log files found for today');
            }
            
            return logFiles;
            
        } catch (error) {
            console.error('Error downloading Due Date logs:', error.message);
            throw error;
        }
    }
    
    async makeNetSuiteRequest(requestBody) {
        return new Promise((resolve, reject) => {
            try {
                const postData = JSON.stringify(requestBody);
                const url = new URL(this.config.restletUrl);
                
                // Create OAuth 1.0 signature
                const oauth = this.createOAuthHeader('POST', this.config.restletUrl);
                
                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'Authorization': oauth
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data);
                            resolve(response);
                        } catch (parseError) {
                            reject(new Error(`Failed to parse response: ${parseError.message}`));
                        }
                    });
                });
                
                req.on('error', (error) => {
                    reject(error);
                });
                
                req.write(postData);
                req.end();
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    createOAuthHeader(method, url) {
        const crypto = require('crypto');
        
        const oauthParams = {
            oauth_consumer_key: this.config.consumerKey,
            oauth_token: this.config.tokenId,
            oauth_signature_method: 'HMAC-SHA256',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_version: '1.0'
        };
        
        // Create parameter string
        const paramString = Object.keys(oauthParams)
            .sort()
            .map(key => `${key}=${encodeURIComponent(oauthParams[key])}`)
            .join('&');
        
        // Create signature base string
        const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
        
        // Create signing key
        const signingKey = `${encodeURIComponent(this.config.consumerSecret)}&${encodeURIComponent(this.config.tokenSecret)}`;
        
        // Create signature
        const signature = crypto
            .createHmac('sha256', signingKey)
            .update(signatureBase)
            .digest('base64');
        
        oauthParams.oauth_signature = signature;
        
        // Create authorization header
        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`)
            .join(', ');
        
        return authHeader;
    }
}

module.exports = { NetSuiteDownloader };