const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'phones.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding geolocation fields to database tables...');

// Add latitude and longitude fields to lost_phones table
db.serialize(() => {
    // Add latitude field to lost_phones
    db.run(`ALTER TABLE lost_phones ADD COLUMN latitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding latitude to lost_phones:', err.message);
        } else {
            console.log('✓ Added latitude field to lost_phones table');
        }
    });
    
    // Add longitude field to lost_phones
    db.run(`ALTER TABLE lost_phones ADD COLUMN longitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding longitude to lost_phones:', err.message);
        } else {
            console.log('✓ Added longitude field to lost_phones table');
        }
    });
    
    // Add latitude field to found_phones
    db.run(`ALTER TABLE found_phones ADD COLUMN latitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding latitude to found_phones:', err.message);
        } else {
            console.log('✓ Added latitude field to found_phones table');
        }
    });
    
    // Add longitude field to found_phones
    db.run(`ALTER TABLE found_phones ADD COLUMN longitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding longitude to found_phones:', err.message);
        } else {
            console.log('✓ Added longitude field to found_phones table');
        }
    });
    
    // Create indexes for geolocation fields
    db.run(`CREATE INDEX IF NOT EXISTS idx_lost_location_coords ON lost_phones(latitude, longitude)`, (err) => {
        if (err) {
            console.error('Error creating geolocation index for lost_phones:', err.message);
        } else {
            console.log('✓ Created geolocation index for lost_phones table');
        }
    });
    
    db.run(`CREATE INDEX IF NOT EXISTS idx_found_location_coords ON found_phones(latitude, longitude)`, (err) => {
        if (err) {
            console.error('Error creating geolocation index for found_phones:', err.message);
        } else {
            console.log('✓ Created geolocation index for found_phones table');
        }
    });
    
    console.log('\nGeolocation fields migration completed!');
    console.log('You can now use latitude and longitude coordinates in your phone reports.');
    
    // Close the database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
});