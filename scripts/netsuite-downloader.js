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
            
            // FIX: Changed action to match your RESTlet
            const requestBody = {
                action: 'downloadTodaysLogs',  // Changed from 'downloadLogs'
                date: today
            };
            
            console.log('Request body:', JSON.stringify(requestBody, null, 2));
            console.log('Calling NetSuite RESTlet...');
            
            const response = await this.makeNetSuiteRequest(requestBody);
            
            console.log('Raw NetSuite response:', JSON.stringify(response, null, 2));
            
            // FIX: Better error handling
            if (!response) {
                throw new Error(`NetSuite RESTlet error: No response received`);
            }
            
            if (response.success === false) {
                throw new Error(`NetSuite RESTlet error: ${response.message || response.error || 'Unknown error'}`);
            }
            
            if (response.success !== true) {
                throw new Error(`NetSuite RESTlet error: Unexpected response format`);
            }
            
            console.log(`NetSuite response: ${response.message}`);
            
            const logFiles = [];
            const logsDir = path.join(process.cwd(), 'logs');
            
            // Ensure logs directory exists
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
                console.log('Created logs directory');
            }
            
            // FIX: Handle empty logFiles array properly
            const responseLogFiles = response.logFiles || [];
            
            if (responseLogFiles.length > 0) {
                console.log(`Processing ${responseLogFiles.length} log files...`);
                
                for (let i = 0; i < responseLogFiles.length; i++) {
                    const logData = responseLogFiles[i];
                    
                    // Use the filename from the response or create one
                    const fileName = logData.name || `dueDateLogs-${today}-${i + 1}.txt`;
                    const filePath = path.join(logsDir, fileName);
                    
                    // Write log content to file
                    const content = logData.content || '';
                    fs.writeFileSync(filePath, content, 'utf8');
                    
                    logFiles.push({
                        name: fileName,
                        path: filePath,
                        type: logData.type || 'duedate',
                        size: logData.size || content.length,
                        modified: logData.modified || today,
                        fileId: logData.fileId || null
                    });
                    
                    console.log(`Saved: ${fileName} (${logData.size || content.length} bytes)`);
                }
            } else {
                console.log('No Due Date log files found for today');
                console.log('This could mean:');
                console.log('  - No due date processing occurred today');
                console.log('  - Files are in different locations than expected');
                console.log('  - File search criteria need adjustment');
            }
            
            return {
                success: true,
                logFiles: logFiles,
                totalFiles: logFiles.length,
                date: today,
                message: response.message
            };
            
        } catch (error) {
            console.error('Error downloading Due Date logs:', error.message);
            
            // Enhanced error logging
            if (error.response) {
                console.error('HTTP Response:', error.response);
            }
            
            if (error.stack) {
                console.error('Stack trace:', error.stack);
            }
            
            throw error;
        }
    }
    
    async makeNetSuiteRequest(requestBody) {
        return new Promise((resolve, reject) => {
            try {
                const postData = JSON.stringify(requestBody);
                const url = new URL(this.config.restletUrl);
                
                console.log('Making request to:', this.config.restletUrl);
                console.log('Request method: POST');
                console.log('Request body size:', postData.length, 'bytes');
                
                // Create OAuth 1.0 signature
                const oauth = this.createOAuthHeader('POST', this.config.restletUrl);
                console.log('OAuth header generated successfully');
                
                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'Authorization': oauth,
                        'User-Agent': 'NetSuite-DueDateAnalyzer/1.0'
                    }
                };
                
                console.log('HTTP request options configured');
                
                const req = https.request(options, (res) => {
                    let data = '';
                    
                    console.log('HTTP Response Status:', res.statusCode);
                    console.log('HTTP Response Headers:', res.headers);
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            console.log('Raw response data:', data);
                            
                            if (!data || data.trim() === '') {
                                reject(new Error('Empty response from NetSuite'));
                                return;
                            }
                            
                            const response = JSON.parse(data);
                            resolve(response);
                            
                        } catch (parseError) {
                            console.error('JSON parse error:', parseError.message);
                            console.error('Response data that failed to parse:', data);
                            reject(new Error(`Failed to parse JSON response: ${parseError.message}\nResponse: ${data}`));
                        }
                    });
                });
                
                req.on('error', (error) => {
                    console.error('HTTPS request error:', error);
                    reject(new Error(`Network error: ${error.message}`));
                });
                
                req.on('timeout', () => {
                    console.error('Request timeout');
                    reject(new Error('Request timeout - NetSuite did not respond within expected time'));
                });
                
                // Set timeout
                req.setTimeout(30000); // 30 seconds
                
                console.log('Sending request...');
                req.write(postData);
                req.end();
                
            } catch (error) {
                console.error('Error setting up request:', error);
                reject(error);
            }
        });
    }
    
    createOAuthHeader(method, url) {
        const crypto = require('crypto');
        
        console.log('Creating OAuth header for:', method, url);
        
        const oauthParams = {
            oauth_consumer_key: this.config.consumerKey,
            oauth_token: this.config.tokenId,
            oauth_signature_method: 'HMAC-SHA256',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_version: '1.0'
        };
        
        console.log('OAuth parameters (excluding signature):', {
            ...oauthParams,
            oauth_consumer_key: oauthParams.oauth_consumer_key.substring(0, 10) + '...',
            oauth_token: oauthParams.oauth_token.substring(0, 10) + '...'
        });
        
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
        
        console.log('OAuth signature created successfully');
        
        return authHeader;
    }
    
    // Test method to check RESTlet connectivity
    async testConnection() {
        try {
            console.log('Testing NetSuite RESTlet connection...');
            
            const response = await this.makeNetSuiteRequest({
                action: 'downloadTodaysLogs',
                date: new Date().toISOString().split('T')[0],
                test: true
            });
            
            console.log('Connection test result:', response);
            return response.success === true;
            
        } catch (error) {
            console.error('Connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = { NetSuiteDownloader };
