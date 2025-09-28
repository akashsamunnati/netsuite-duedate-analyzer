// Try both import methods to handle different export formats
let NetSuiteDownloader;
try {
    // Try destructured import first
    NetSuiteDownloader = require('./netsuite-downloader').NetSuiteDownloader;
} catch (error) {
    try {
        // Try default import
        NetSuiteDownloader = require('./netsuite-downloader');
    } catch (error2) {
        console.error('Failed to import NetSuiteDownloader:', error.message);
        throw new Error('Cannot import NetSuiteDownloader. Check the export format in netsuite-downloader.js');
    }
}

const fs = require('fs').promises;
const path = require('path');

class DueDateLogAnalyzer {
    constructor() {
        this.config = {
            accountId: process.env.NETSUITE_PROD_ACCOUNT_ID,
            consumerKey: process.env.NETSUITE_PROD_CONSUMER_KEY,
            consumerSecret: process.env.NETSUITE_PROD_CONSUMER_SECRET,
            tokenId: process.env.NETSUITE_PROD_TOKEN_ID,
            tokenSecret: process.env.NETSUITE_PROD_TOKEN_SECRET,
            restletUrl: process.env.NETSUITE_PROD_RESTLET_URL,
        };
        
        console.log('Creating NetSuiteDownloader instance...');
        this.downloader = new NetSuiteDownloader(this.config);
        this.today = new Date().toISOString().split('T')[0];
    }

    async runDailyAnalysis() {
        console.log('============================================================');
        console.log('GITHUB ACTIONS - DAILY DUE DATE LOG ANALYSIS');
        console.log(`Started at: ${new Date().toISOString()}`);
        console.log(`Today's date: ${this.today}`);
        console.log('============================================================');

        try {
            // Step 1: Download logs
            console.log('\nSTEP 1: Downloading today\'s Due Date log files from NetSuite...');
            const result = await this.downloader.downloadTodaysDueDateLogs(this.today);
            
            // FIX: Properly extract logFiles from the result
            const logFiles = result.logFiles || []; // This ensures logFiles is always an array
            console.log(`Downloaded ${logFiles.length} Due Date log files for today`);
            
            // Step 2: Process results
            if (logFiles.length === 0) {
                console.log('\n📝 No log files found for today');
                console.log('This is normal if:');
                console.log('  • No due date updates occurred today');
                console.log('  • No penalties were calculated today'); 
                console.log('  • No expenses were processed today');
                console.log('  • No system errors occurred today');
                
                // Create a "no logs" report
                await this.createNoLogsReport(result);
                
                console.log('\n✓ Daily Due Date analysis completed - no logs to analyze');
                return;
            }

            // Step 3: Analyze the log files that were downloaded
            console.log('\nSTEP 2: Analyzing downloaded log files...');
            
            let totalEntries = 0;
            const analysis = {
                duedate: 0,
                penalty: 0, 
                expense: 0,
                system: 0,
                errors: []
            };

            // FIX: Now logFiles is guaranteed to be an array
            logFiles.forEach((logFile, index) => {
                console.log(`  Analyzing file ${index + 1}: ${logFile.name} (${logFile.type})`);
                
                const content = logFile.content || '';
                const lines = content.split('\n').filter(line => line.trim().length > 0).length;
                const type = logFile.type || 'unknown';
                
                console.log(`    - Type: ${type}`);
                console.log(`    - Size: ${logFile.size || 0} bytes`);
                console.log(`    - Lines: ${lines}`);
                
                analysis[type] = (analysis[type] || 0) + lines;
                totalEntries += lines;
                
                // Look for errors in content
                if (content.toLowerCase().includes('error') || 
                    content.toLowerCase().includes('exception') ||
                    content.toLowerCase().includes('failed')) {
                    analysis.errors.push({
                        file: logFile.name,
                        type: type
                    });
                }
            });

            console.log('\n📊 Analysis Summary:');
            console.log(`  Total log entries: ${totalEntries}`);
            console.log(`  Due date entries: ${analysis.duedate}`);
            console.log(`  Penalty entries: ${analysis.penalty}`);
            console.log(`  Expense entries: ${analysis.expense}`);
            console.log(`  System entries: ${analysis.system}`);
            console.log(`  Files with errors: ${analysis.errors.length}`);

            // Step 4: Save analysis report
            await this.saveAnalysisReport(analysis, logFiles.length);
            
            console.log('\n✓ Daily Due Date analysis completed successfully');

        } catch (error) {
            console.error('\n❌ Daily Due Date analysis failed:', error.message);
            console.error('Stack trace:', error.stack);
            
            // Create error report
            await this.createErrorReport(error);
            
            // Exit with error code
            process.exit(1);
        }
    }

    async saveAnalysisReport(analysis, totalFiles) {
        const errorsDir = path.join(process.cwd(), 'errors');
        try {
            await fs.mkdir(errorsDir, { recursive: true });
        } catch (err) {
            // Directory exists
        }

        const reportFile = path.join(errorsDir, `duedate-analysis-${this.today}.txt`);
        
        const report = [
            `Due Date Log Analysis Report`,
            `Generated: ${new Date().toISOString()}`,
            `Date: ${this.today}`,
            ``,
            `SUMMARY:`,
            `========`,
            `Total files processed: ${totalFiles}`,
            `Total log entries: ${Object.values(analysis).reduce((sum, val) => 
                typeof val === 'number' ? sum + val : sum, 0)}`,
            `Due date entries: ${analysis.duedate}`,
            `Penalty entries: ${analysis.penalty}`,
            `Expense entries: ${analysis.expense}`,
            `System entries: ${analysis.system}`,
            `Files with errors: ${analysis.errors.length}`,
            ``,
            `STATUS: ${analysis.errors.length > 0 ? '⚠️  ERRORS FOUND' : '✅ NO ERRORS'}`,
            ``
        ];

        if (analysis.errors.length > 0) {
            report.push(`ERROR FILES:`);
            report.push(`===========`);
            analysis.errors.forEach(error => {
                report.push(`- ${error.file} (${error.type})`);
            });
            report.push(``);
        }

        await fs.writeFile(reportFile, report.join('\n'), 'utf8');
        console.log(`✓ Analysis report saved: ${reportFile}`);
    }

    async createNoLogsReport(result) {
        const errorsDir = path.join(process.cwd(), 'errors');
        try {
            await fs.mkdir(errorsDir, { recursive: true });
        } catch (err) {
            // Directory exists
        }

        const reportFile = path.join(errorsDir, `duedate-no-logs-${this.today}.txt`);
        
        const report = [
            `Due Date Log Analysis - No Logs Found`,
            `Generated: ${new Date().toISOString()}`,
            `Date: ${this.today}`,
            ``,
            `RESULT:`,
            `=======`,
            `No log files were found for ${this.today}`,
            ``,
            `NetSuite Response:`,
            `Success: ${result.success}`,
            `Message: ${result.message}`,
            `Timestamp: ${result.timestamp}`,
            `Total Files: ${result.totalFiles || 0}`,
            ``,
            `This is normal if no due date processing occurred today.`,
            ``
        ];

        await fs.writeFile(reportFile, report.join('\n'), 'utf8');
        console.log(`✓ No-logs report saved: ${reportFile}`);
    }

    async createErrorReport(error) {
        const errorsDir = path.join(process.cwd(), 'errors');
        try {
            await fs.mkdir(errorsDir, { recursive: true });
        } catch (err) {
            // Directory exists
        }

        const errorFile = path.join(errorsDir, `duedate-system-error-${this.today}.txt`);
        
        const report = [
            `Due Date Analysis System Error`,
            `Generated: ${new Date().toISOString()}`,
            `Date: ${this.today}`,
            ``,
            `ERROR DETAILS:`,
            `=============`,
            `Message: ${error.message}`,
            ``,
            `Stack Trace:`,
            `${error.stack || 'No stack trace available'}`,
            ``,
            `Configuration Check:`,
            `Account ID: ${this.config.accountId ? '✓ Present' : '❌ Missing'}`,
            `Consumer Key: ${this.config.consumerKey ? '✓ Present' : '❌ Missing'}`,
            `Token ID: ${this.config.tokenId ? '✓ Present' : '❌ Missing'}`,
            `RESTlet URL: ${this.config.restletUrl ? '✓ Present' : '❌ Missing'}`,
            ``
        ];

        await fs.writeFile(errorFile, report.join('\n'), 'utf8');
        console.log(`Created system error report: ${errorFile}`);
    }
}

// Run the analysis
async function main() {
    const analyzer = new DueDateLogAnalyzer();
    await analyzer.runDailyAnalysis();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DueDateLogAnalyzer;
