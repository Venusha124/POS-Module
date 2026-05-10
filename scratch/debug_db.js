const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pos_data.db');

db.serialize(() => {
    console.log("Updating table 14 to Dirty...");
    db.run("UPDATE restaurant_tables SET status = 'Dirty' WHERE id = 14", (err) => {
        if (err) console.error(err);
        db.get("SELECT * FROM restaurant_tables WHERE id = 14", (err, row) => {
            console.log("Table 14 result:", row);
        });
    });
});
