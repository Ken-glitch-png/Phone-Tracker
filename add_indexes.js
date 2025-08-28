const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'phones.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding database indexes for improved search performance...');

// Define indexes to create for better search performance
const indexes = [
    // Lost phones indexes
    'CREATE INDEX IF NOT EXISTS idx_lost_phone_number ON lost_phones(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_lost_imei ON lost_phones(imei)',
    'CREATE INDEX IF NOT EXISTS idx_lost_brand ON lost_phones(brand)',
    'CREATE INDEX IF NOT EXISTS idx_lost_model ON lost_phones(model)',
    'CREATE INDEX IF NOT EXISTS idx_lost_country ON lost_phones(country)',
    'CREATE INDEX IF NOT EXISTS idx_lost_region_state ON lost_phones(region_state)',
    'CREATE INDEX IF NOT EXISTS idx_lost_city ON lost_phones(city)',
    'CREATE INDEX IF NOT EXISTS idx_lost_status ON lost_phones(status)',
    'CREATE INDEX IF NOT EXISTS idx_lost_date ON lost_phones(date_lost)',
    
    // Composite indexes for common search combinations
    'CREATE INDEX IF NOT EXISTS idx_lost_location ON lost_phones(country, region_state, city)',
    'CREATE INDEX IF NOT EXISTS idx_lost_device ON lost_phones(brand, model)',
    'CREATE INDEX IF NOT EXISTS idx_lost_contact ON lost_phones(contact_name, contact_phone)',
    
    // Found phones indexes
    'CREATE INDEX IF NOT EXISTS idx_found_phone_number ON found_phones(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_found_imei ON found_phones(imei)',
    'CREATE INDEX IF NOT EXISTS idx_found_brand ON found_phones(brand)',
    'CREATE INDEX IF NOT EXISTS idx_found_model ON found_phones(model)',
    'CREATE INDEX IF NOT EXISTS idx_found_country ON found_phones(country)',
    'CREATE INDEX IF NOT EXISTS idx_found_region_state ON found_phones(region_state)',
    'CREATE INDEX IF NOT EXISTS idx_found_city ON found_phones(city)',
    'CREATE INDEX IF NOT EXISTS idx_found_date ON found_phones(date_found)',
    
    // Composite indexes for found phones
    'CREATE INDEX IF NOT EXISTS idx_found_location ON found_phones(country, region_state, city)',
    'CREATE INDEX IF NOT EXISTS idx_found_device ON found_phones(brand, model)',
    'CREATE INDEX IF NOT EXISTS idx_found_finder ON found_phones(finder_name, finder_contact)'
];

// Function to create indexes
function createIndexes() {
    return new Promise((resolve, reject) => {
        let completed = 0;
        const total = indexes.length;
        
        if (total === 0) {
            resolve();
            return;
        }
        
        indexes.forEach((indexSQL, i) => {
            db.run(indexSQL, function(err) {
                if (err) {
                    console.error(`Error creating index ${i + 1}:`, err.message);
                } else {
                    console.log(`✓ Created index ${i + 1}/${total}: ${indexSQL.split(' ')[5]}`);
                }
                
                completed++;
                if (completed === total) {
                    resolve();
                }
            });
        });
    });
}

// Function to analyze database for query optimization
function analyzeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('\nRunning ANALYZE command to update database statistics...');
        db.run('ANALYZE', function(err) {
            if (err) {
                console.error('Error running ANALYZE:', err.message);
                reject(err);
            } else {
                console.log('✓ Database analysis completed');
                resolve();
            }
        });
    });
}

// Function to show current indexes
function showIndexes() {
    return new Promise((resolve, reject) => {
        console.log('\nCurrent database indexes:');
        db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
            if (err) {
                console.error('Error fetching indexes:', err.message);
                reject(err);
            } else {
                rows.forEach(row => {
                    console.log(`- ${row.name}`);
                });
                console.log(`\nTotal custom indexes: ${rows.length}`);
                resolve();
            }
        });
    });
}

// Main execution
async function main() {
    try {
        await createIndexes();
        await analyzeDatabase();
        await showIndexes();
        
        console.log('\n🎉 Database indexing completed successfully!');
        console.log('Search performance should now be significantly improved.');
        
    } catch (error) {
        console.error('Error during indexing process:', error);
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

main();