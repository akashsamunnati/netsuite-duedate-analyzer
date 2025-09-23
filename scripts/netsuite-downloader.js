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
        
        // Enhanced validation logging
        console.log('Configuration validation:');
        console.log('✓ Account ID:', this.config.accountId);
        console.log('✓ Consumer Key length:', this.config.consumerKey.length);
        console.log('✓ Consumer Secret length:', this.config.consumerSecret.length);
        console.log('✓ Token ID length:', this.config.tokenId.length);
        console.log('✓ Token Secret length:', this.config.tokenSecret.length);
        console.log('✓ RESTlet URL:', this.config.restletUrl);
    }
    
    async downloadTodaysDueDateLogs() {
        try {
            const today = new Date().toISOString().split('T')[0];
            console.log(`Downloading Due Date logs for date: ${today}`);
            
            const requestBody = {
                action: 'downloadTodaysLogs',
                date: today
            };
            
            console.log('Request body:', JSON.stringify(requestBody, null, 2));
            console.log('Calling NetSuite RESTlet...');
            
            const response = await this.makeNetSuiteRequest(requestBody);
            
            console.log('Raw NetSuite response:', JSON.stringify(response, null, 2));
            
            // Handle authentication error specifically
            if (response.error) {
                if (response.error.code === 'INVALID_LOGIN_ATTEMPT') {
                    throw new Error(`Authentication failed: ${response.error.message}. Check your OAuth credentials and integration setup.`);
                }
                throw new Error(`NetSuite API error: ${response.error.code} - ${response.error.message}`);
            }
            
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
            
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
                console.log('Created logs directory');
            }
            
            const responseLogFiles = response.logFiles || [];
            
            if (responseLogFiles.length > 0) {
                console.log(`Processing ${responseLogFiles.length} log files...`);
                
                for (let i = 0; i < responseLogFiles.length; i++) {
                    const logData = responseLogFiles[i];
                    const fileName = logData.name || `dueDateLogs-${today}-${i + 1}.txt`;
                    const filePath = path.join(logsDir, fileName);
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
                
                // Create OAuth 1.0 signature with debug info
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
                            reject(new Error(`Failed to parse JSON response: ${parseError.message}\nResponse: ${data}`));
                        }
                    });
                });
                
                req.on('error', (error) => {
                    console.error('HTTPS request error:', error);
                    reject(new Error(`Network error: ${error.message}`));
                });
                
                req.setTimeout(30000);
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
        
        // Fix potential timestamp issue - use current UTC time
        const timestamp = Math.floor(Date.now() / 1000).toString();
        console.log('Using timestamp:', timestamp, '(', new Date(parseInt(timestamp) * 1000).toISOString(), ')');
        
        const oauthParams = {
            oauth_consumer_key: this.config.consumerKey,
            oauth_token: this.config.tokenId,
            oauth_signature_method: 'HMAC-SHA256',
            oauth_timestamp: timestamp,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_version: '1.0'
        };
        
        console.log('OAuth parameters:', {
            oauth_consumer_key: oauthParams.oauth_consumer_key.substring(0, 10) + '...',
            oauth_token: oauthParams.oauth_token.substring(0, 10) + '...',
            oauth_signature_method: oauthParams.oauth_signature_method,
            oauth_timestamp: oauthParams.oauth_timestamp,
            oauth_nonce: oauthParams.oauth_nonce.substring(0, 10) + '...',
            oauth_version: oauthParams.oauth_version
        });
        
        // Create parameter string (alphabetically sorted)
        const sortedParams = Object.keys(oauthParams).sort();
        const paramString = sortedParams
            .map(key => `${this.percentEncode(key)}=${this.percentEncode(oauthParams[key])}`)
            .join('&');
        
        console.log('Parameter string length:', paramString.length);
        
        // Create signature base string
        const signatureBase = `${method}&${this.percentEncode(url)}&${this.percentEncode(paramString)}`;
        console.log('Signature base string length:', signatureBase.length);
        
        // Create signing key
        const signingKey = `${this.percentEncode(this.config.consumerSecret)}&${this.percentEncode(this.config.tokenSecret)}`;
        console.log('Signing key created (length:', signingKey.length, ')');
        
        // Create signature
        const signature = crypto
            .createHmac('sha256', signingKey)
            .update(signatureBase)
            .digest('base64');
        
        console.log('Signature created:', signature.substring(0, 20) + '...');
        
        oauthParams.oauth_signature = signature;
        
        // Create authorization header
        const authHeader = 'OAuth ' + sortedParams
            .concat('oauth_signature')
            .sort()
            .map(key => `${key}="${this.percentEncode(oauthParams[key])}"`)
            .join(', ');
        
        console.log('Authorization header created (length:', authHeader.length, ')');
        
        return authHeader;
    }
    
    // Proper percent encoding for OAuth
    percentEncode(str) {
        return encodeURIComponent(str)
            .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    }
    
    // Simple connectivity test
    async testBasicConnection() {
        return new Promise((resolve) => {
            const url = new URL(this.config.restletUrl);
            
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'GET',
                timeout: 10000
            };
            
            const req = https.request(options, (res) => {
                console.log('Basic connection test - Status:', res.statusCode);
                resolve(res.statusCode);
            });
            
            req.on('error', (error) => {
                console.error('Basic connection failed:', error.message);
                resolve(null);
            });
            
            req.on('timeout', () => {
                console.error('Basic connection timeout');
                resolve(null);
            });
            
            req.end();
        });
    }
}

module.exports = { NetSuiteDownloader };
