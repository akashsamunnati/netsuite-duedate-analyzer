const { NetSuiteDownloader } = require('./netsuite-downloader');
const { GeminiAnalyzer } = require('./gemini-analyzer');

class DueDateLogAnalyzer {
    constructor() {
        // Load configuration from environment variables
        this.config = {
            accountId: process.env.NETSUITE_PROD_ACCOUNT_ID,
            consumerKey: process.env.NETSUITE_PROD_CONSUMER_KEY,
            consumerSecret: process.env.NETSUITE_PROD_CONSUMER_SECRET,
            tokenId: process.env.NETSUITE_PROD_TOKEN_ID,
            tokenSecret: process.env.NETSUITE_PROD_TOKEN_SECRET,
            restletUrl: process.env.NETSUITE_PROD_RESTLET_URL,
            geminiApiKey: process.env.GEMINI_API_KEY
        };
        
        this.netsuiteDownloader = new NetSuiteDownloader(this.config);
        this.geminiAnalyzer = new GeminiAnalyzer(this.config.geminiApiKey);
        
        this.validateConfig();
    }
    
    validateConfig() {
        const required = ['accountId', 'consumerKey', 'consumerSecret', 'tokenId', 'tokenSecret', 'restletUrl', 'geminiApiKey'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }
    }
    
    async runDailyAnalysis() {
        try {
            console.log('='.repeat(60));
            console.log('GITHUB ACTIONS - DAILY DUE DATE LOG ANALYSIS');
            console.log('Started at:', new Date().toISOString());
            console.log('Today\'s date:', new Date().toISOString().split('T')[0]);
            console.log('='.repeat(60));
            
            // Step 1: Download today's Due Date log files from NetSuite
            console.log('\nSTEP 1: Downloading today\'s Due Date log files from NetSuite...');
            const logFiles = await this.netsuiteDownloader.downloadTodaysDueDateLogs();
            
            if (logFiles.length === 0) {
                console.log('No Due Date log files found for today. Creating no-logs report...');
                await this.createNoLogsReport();
                return;
            }
            
            console.log(`Downloaded ${logFiles.length} Due Date log files for today`);
            logFiles.forEach(file => {
                console.log(`   ${file.name} (${file.size} bytes)`);
            });
            
            // Step 2: Analyze each log file with Gemini AI
            console.log('\nSTEP 2: Analyzing Due Date log files with Gemini AI...');
            const analysisResults = await this.geminiAnalyzer.analyzeLogFiles(logFiles);
            
            // Step 3: Summary report
            console.log('\nSTEP 3: Analysis Summary...');
            const totalErrors = analysisResults.reduce((sum, result) => sum + (result.errorCount || 0), 0);
            const errorFiles = analysisResults.filter(result => result.hasErrors);
            
            console.log(`   Total errors found: ${totalErrors}`);
            console.log(`   Systems with errors: ${errorFiles.length}`);
            console.log(`   Error files created: ${analysisResults.length}`);
            
            if (totalErrors > 0) {
                console.log('\nERRORS DETECTED:');
                errorFiles.forEach(result => {
                    console.log(`   Due Date System: ${result.errorCount} errors`);
                });
            } else {
                console.log('\nNO ERRORS DETECTED - Due Date system normal');
            }
            
            console.log('\nDaily Due Date analysis completed successfully!');
            console.log('Error files available in /errors/ directory');
            console.log('='.repeat(60));
            
        } catch (error) {
            console.error('Daily Due Date analysis failed:', error.message);
            console.error('Stack trace:', error.stack);
            await this.createErrorReport(error);
            throw error;
        }
    }
    
    async createNoLogsReport() {
        const fs = require('fs');
        const path = require('path');
        
        const today = new Date().toISOString().split('T')[0];
        const errorsDir = path.join(process.cwd(), 'errors');
        
        if (!fs.existsSync(errorsDir)) {
            fs.mkdirSync(errorsDir, { recursive: true });
        }
        
        const reportPath = path.join(errorsDir, `no-duedate-logs-found-${today}.txt`);
        const reportContent = `DAILY DUE DATE LOG ANALYSIS REPORT
Date: ${today}
Generated: ${new Date().toISOString()}
Status: NO LOG FILES FOUND

==============================================
ANALYSIS RESULT:
==============================================

No Due Date log files were found for today's date.

This could indicate:
- All Due Date systems running normally with no errors to log
- Log generation may be disabled
- NetSuite connection issues
- File access permissions issues

==============================================
RECOMMENDED ACTIONS:
==============================================

1. Verify NetSuite Due Date systems are operational
2. Check log generation settings
3. Confirm network connectivity
4. Review file cabinet permissions
5. Contact IT if systems appear offline

==============================================
Generated by: GitHub Actions Automated Analysis
==============================================`;

        fs.writeFileSync(reportPath, reportContent, 'utf8');
        console.log(`Created no-logs report: no-duedate-logs-found-${today}.txt`);
    }
    
    async createErrorReport(error) {
        const fs = require('fs');
        const path = require('path');
        
        const today = new Date().toISOString().split('T')[0];
        const errorsDir = path.join(process.cwd(), 'errors');
        
        if (!fs.existsSync(errorsDir)) {
            fs.mkdirSync(errorsDir, { recursive: true });
        }
        
        const errorReportPath = path.join(errorsDir, `duedate-system-error-${today}.txt`);
        const errorReportContent = `DUE DATE SYSTEM ERROR REPORT
Date: ${today}
Generated: ${new Date().toISOString()}
Status: ANALYSIS FAILED

==============================================
ERROR DETAILS:
==============================================

The daily Due Date log analysis process failed with the following error:

Error Message: ${error.message}

Stack Trace:
${error.stack || 'No stack trace available'}

==============================================
IMMEDIATE ACTIONS REQUIRED:
==============================================

1. Check GitHub Actions workflow logs
2. Verify NetSuite API credentials
3. Confirm Gemini API key is valid
4. Check network connectivity
5. Contact technical team for resolution

==============================================
TROUBLESHOOTING STEPS:
==============================================

1. Verify all environment variables are set correctly
2. Test NetSuite RESTlet manually
3. Check API rate limits
4. Review log file formats
5. Ensure all dependencies are installed

==============================================
Generated by: GitHub Actions (Error Handler)
==============================================`;

        fs.writeFileSync(errorReportPath, errorReportContent, 'utf8');
        console.log(`Created system error report: duedate-system-error-${today}.txt`);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    const analyzer = new DueDateLogAnalyzer();
    analyzer.runDailyAnalysis()
        .then(() => {
            console.log('Analysis completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { DueDateLogAnalyzer };