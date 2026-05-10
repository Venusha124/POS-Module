const db = require('../database');
db.all("SELECT * FROM users", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    process.exit();
});
