const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('pos_data.db');

db.all("SELECT * FROM audit_logs WHERE target_id = '15' OR target_id = 'ORD-7953' ORDER BY id DESC", (err, rows) => {
    console.log(rows);
});
