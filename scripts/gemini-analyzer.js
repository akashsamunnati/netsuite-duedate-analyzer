const fs = require('fs');
const path = require('path');
const https = require('https');

class GeminiAnalyzer {
    constructor(apiKey) {
        this.apiKey = apiKey;
        if (!this.apiKey) {
            throw new Error('Gemini API key is required');
        }
    }
    
    async analyzeLogFiles(logFiles) {
        try {
            console.log(`Analyzing ${logFiles.length} log files with Gemini AI...`);
            
            // Ensure errors directory exists
            const errorsDir = path.join(process.cwd(), 'errors');
            if (!fs.existsSync(errorsDir)) {
                fs.mkdirSync(errorsDir, { recursive: true });
            }
            
            const results = [];
            
            for (const logFile of logFiles) {
                console.log(`Processing: ${logFile.name}...`);
                const result = await this.processLogFile(logFile, errorsDir);
                results.push(result);
            }
            
            // Generate daily summary
            await this.generateDailySummary(results, errorsDir);
            
            return results;
            
        } catch (error) {
            console.error('Error analyzing log files:', error.message);
            throw error;
        }
    }
    
    async processLogFile(logFile, errorsDir) {
        try {
            const logContent = fs.readFileSync(logFile.path, 'utf8');
            console.log(`Read ${logContent.length} characters from ${logFile.name}`);
            
            const prompt = this.createAnalysisPrompt(logFile.type, logContent);
            const aiResponse = await this.callGeminiAPI(prompt);
            
            const today = new Date().toISOString().split('T')[0];
            const outputFileName = `duedate-errors-${today}.txt`;
            const outputPath = path.join(errorsDir, outputFileName);
            
            const hasErrors = !aiResponse.includes('NO ERRORS DETECTED');
            const errorCount = hasErrors ? (aiResponse.match(/Error \d+:/g) || []).length : 0;
            
            let finalReport;
            
            if (hasErrors) {
                console.log(`Found ${errorCount} errors in Due Date logs`);
                finalReport = this.createErrorReport(logFile, aiResponse, today, errorCount);
            } else {
                console.log('No errors detected by AI in Due Date logs');
                finalReport = this.createNoErrorReport(logFile, aiResponse, today);
            }
            
            fs.writeFileSync(outputPath, finalReport, 'utf8');
            console.log(`Saved: ${outputFileName}`);
            
            return {
                logFile: logFile,
                outputFile: outputFileName,
                hasErrors: hasErrors,
                errorCount: errorCount,
                aiResponse: aiResponse
            };
            
        } catch (error) {
            console.error(`Failed to process ${logFile.name}:`, error.message);
            return await this.createFallbackReport(logFile, error, errorsDir);
        }
    }
    
    createAnalysisPrompt(logType, logContent) {
        return `Analyze this NetSuite Due Date system log and extract ALL errors, failures, exceptions, and issues.

LOG CONTENT:
${logContent}

Please identify and extract:
1. Any script errors with details (Bill Payment ID, Invoice ID, Error Name, Error Message, amounts, dates)
2. Any Due Date calculation errors
3. Any exceptions or stack traces
4. Any timeout or connectivity issues
5. Any validation failures
6. Any null pointer exceptions
7. Any API call failures
8. Any database connection issues
9. Any authentication failures
10. Any workflow errors related to due date processing

For each error found, format it as:
Error [number]: [timestamp]
   Type: [error type]
   Bill Payment ID: [if available]
   Invoice ID: [if available] 
   Bill ID: [if available]
   Amount: [if available]
   UTR Date: [if available]
   Error Name: [if available]
   Error Message: [the actual error message]
   Stack Trace: [if available]
   
If no errors are found, respond with: "NO ERRORS DETECTED"

Only return the formatted errors, no analysis or commentary.`;
    }
    
    async callGeminiAPI(prompt) {
        return new Promise((resolve, reject) => {
            try {
                const requestBody = {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 4000,
                    }
                };
                
                const postData = JSON.stringify(requestBody);
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
                const url = new URL(apiUrl);
                
                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`Gemini API error: ${res.statusCode} - ${data}`));
                                return;
                            }
                            
                            const result = JSON.parse(data);
                            
                            if (!result.candidates || result.candidates.length === 0) {
                                reject(new Error('No response from Gemini AI'));
                                return;
                            }
                            
                            resolve(result.candidates[0].content.parts[0].text);
                            
                        } catch (parseError) {
                            reject(new Error(`Failed to parse Gemini response: ${parseError.message}`));
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
    
    createErrorReport(logFile, aiResponse, date, errorCount) {
        const timestamp = new Date().toISOString();
        
        return `DUE DATE LOG ERROR REPORT
Generated: ${timestamp}
Date: ${date}
Source File: ${logFile.name}
Status: ERRORS DETECTED (${errorCount} errors found)
Detected by: Gemini AI

==============================================
ERRORS DETECTED:
==============================================

${aiResponse}

==============================================
RECOMMENDED ACTIONS:
==============================================

1. Review errors above immediately
2. Check Due Date system status
3. Contact development team if critical errors found
4. Update error tracking system
5. Monitor system for resolution

==============================================
END OF REPORT
==============================================`;
    }
    
    createNoErrorReport(logFile, aiResponse, date) {
        const timestamp = new Date().toISOString();
        
        return `DUE DATE LOG ERROR REPORT
Generated: ${timestamp}
Date: ${date}
Source File: ${logFile.name}
Status: NO ERRORS FOUND
Detected by: Gemini AI

==============================================
ANALYSIS RESULT:
==============================================

${aiResponse}

The Due Date system appears to be running normally.

==============================================
END OF REPORT
==============================================`;
    }
    
    async generateDailySummary(results, errorsDir) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const totalErrors = results.reduce((sum, result) => sum + (result.errorCount || 0), 0);
            
            let summaryContent = `DAILY DUE DATE ANALYSIS SUMMARY
Date: ${today}
Generated: ${new Date().toISOString()}
Analysis Tool: GitHub Actions - NetSuite Due Date Log Analyzer

==============================================
OVERVIEW:
==============================================

Total Log Files Analyzed: ${results.length}
Total Errors Found: ${totalErrors}

`;

            results.forEach(result => {
                const status = result.hasErrors ? 'ERRORS FOUND' : 'NORMAL';
                summaryContent += `Due Date System:
  Status: ${status}
  Errors Found: ${result.errorCount || 0}
  Report File: ${result.outputFile}

`;
            });
            
            summaryContent += `==============================================
CRITICAL ISSUES:
==============================================

${totalErrors > 0 ? 
    `Due Date System: ${totalErrors} errors found - REVIEW REQUIRED` : 
    'No critical issues detected today - System running normally'}

==============================================
ANALYSIS STATUS:
==============================================

${totalErrors > 0 ? `
ERRORS DETECTED:
- ${totalErrors} total errors found in Due Date system
- Detailed report available in error file
- Immediate review required for system stability
` : `
SYSTEM STATUS: NORMAL
Due Date system is operating within normal parameters.
No errors detected in today's operations.
`}

==============================================
FILES CREATED:
==============================================

${results.map(r => `- ${r.outputFile}`).join('\n')}

==============================================
Generated by: GitHub Actions Automated Analysis
Next Analysis: Tomorrow at 6:00 PM IST
==============================================`;

            const summaryPath = path.join(errorsDir, `daily-summary-${today}.txt`);
            fs.writeFileSync(summaryPath, summaryContent, 'utf8');
            
            console.log(`Created daily summary: daily-summary-${today}.txt`);
            console.log(`Total errors found: ${totalErrors}`);
            
        } catch (error) {
            console.error('Error generating daily summary:', error.message);
        }
    }
    
    async createFallbackReport(logFile, error, errorsDir) {
        const today = new Date().toISOString().split('T')[0];
        const fallbackPath = path.join(errorsDir, `duedate-errors-${today}.txt`);
        
        const fallbackContent = `DUE DATE LOG ERROR REPORT
Generated: ${new Date().toISOString()}
Date: ${today}
Source File: ${logFile.name}
Status: AI ANALYSIS FAILED

==============================================
ERROR DETAILS:
==============================================

AI analysis could not be completed.
Reason: ${error.message}

MANUAL REVIEW REQUIRED:
Please manually review the Due Date log file: ${logFile.name}

This could indicate:
- API rate limits exceeded
- Network connectivity issues
- Invalid API key
- Log file format issues

==============================================
NEXT STEPS:
==============================================

1. Check API credentials and limits
2. Manually review log file for errors
3. Contact technical team if issues persist
4. Retry analysis after resolving API issues

==============================================
Generated by: GitHub Actions (Fallback Report)
==============================================`;
        
        fs.writeFileSync(fallbackPath, fallbackContent, 'utf8');
        
        return {
            logFile: logFile,
            outputFile: `duedate-errors-${today}.txt`,
            hasErrors: false,
            errorCount: 0,
            aiResponse: 'Analysis failed: ' + error.message
        };
    }
}

module.exports = { GeminiAnalyzer };