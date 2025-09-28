const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
        
        console.log('Configuration validation:');
        console.log('✓ Account ID:', this.config.accountId);
        console.log('✓ Consumer Key length:', this.config.consumerKey.length);
        console.log('✓ Consumer Secret length:', this.config.consumerSecret.length);
        console.log('✓ Token ID length:', this.config.tokenId.length);
        console.log('✓ Token Secret length:', this.config.tokenSecret.length);
        console.log('✓ RESTlet URL:', this.config.restletUrl);
    }
    
    // Use the same OAuth generation logic as your working deploy script
    generateOAuthHeader(url, method, body = null) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto.randomBytes(16).toString('hex');

        // Parse URL to separate base URL and query parameters
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        
        // Get query parameters
        const queryParams = {};
        urlObj.searchParams.forEach((value, key) => {
            queryParams[key] = value;
        });

        const oauthParams = {
            oauth_consumer_key: this.config.consumerKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA256',
            oauth_timestamp: timestamp,
            oauth_token: this.config.tokenId,
            oauth_version: '1.0'
        };

        // Combine OAuth params and query params for signature
        const allParams = { ...oauthParams, ...queryParams };
        
        const paramString = Object.keys(allParams)
            .sort()
            .map(key => `${this.encodeRFC3986(key)}=${this.encodeRFC3986(allParams[key])}`)
            .join('&');

        const baseString = `${method}&${this.encodeRFC3986(baseUrl)}&${this.encodeRFC3986(paramString)}`;
        const signingKey = `${this.encodeRFC3986(this.config.consumerSecret)}&${this.encodeRFC3986(this.config.tokenSecret)}`;
        const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');

        // Format exactly like your working deploy script
        return 'OAuth ' + [
            `realm="${this.encodeRFC3986(this.config.accountId)}"`,
            `oauth_consumer_key="${this.encodeRFC3986(this.config.consumerKey)}"`,
            `oauth_nonce="${this.encodeRFC3986(nonce)}"`,
            `oauth_signature="${this.encodeRFC3986(signature)}"`,
            `oauth_signature_method="HMAC-SHA256"`,
            `oauth_timestamp="${this.encodeRFC3986(timestamp)}"`,
            `oauth_token="${this.encodeRFC3986(this.config.tokenId)}"`,
            `oauth_version="1.0"`
        ].join(', ');
    }

    // Use the same RFC3986 encoding as your working script
    encodeRFC3986(str) {
        return encodeURIComponent(str)
            .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
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
        const postData = JSON.stringify(requestBody);
        
        console.log('Making request to:', this.config.restletUrl);
        console.log('Request method: POST');
        console.log('Request body size:', postData.length, 'bytes');
        
        // Use the same OAuth generation as your working deploy script
        const authHeader = this.generateOAuthHeader(this.config.restletUrl, 'POST', postData);
        console.log('OAuth header generated successfully');
        
        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            console.log('HTTP request options configured');
            
            const req = https.request(this.config.restletUrl, options, (res) => {
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
            
            console.log('Sending request...');
            req.write(postData);
            req.end();
        });
    }

    // Test method using the same auth as your working deploy script
    async testAuth() {
        const baseUrl = `https://${this.config.accountId.toLowerCase().replace('_', '-')}.suitetalk.api.netsuite.com`;
        const url = `${baseUrl}/services/rest/record/v1/metadata-catalog`;
        const authHeader = this.generateOAuthHeader(url, 'GET');

        return new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            };

            console.log('Testing authentication with metadata-catalog...');

            const req = https.request(url, options, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log(`Auth test response: HTTP ${res.statusCode}`);
                    if (res.statusCode === 200) {
                        console.log('✓ Authentication successful');
                        resolve(true);
                    } else {
                        console.log(`✗ Authentication failed: HTTP ${res.statusCode} - ${data}`);
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Auth test error:', error.message);
                resolve(false);
            });
            
            req.end();
        });
    }
}

module.exports = { NetSuiteDownloader };
