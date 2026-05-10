/**
 * Menu Migration Script
 * Clears all existing dishes and categories, then seeds the new Sri Lankan menu.
 * Run: node scripts/update_menu.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../pos_data.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
    new Promise((res, rej) => db.run(sql, params, function (err) { err ? rej(err) : res(this); }));

// Image base path (served as static files from the server)
const IMG = (file) => `assets/images/menu/${file}`;

const categories = [
    ['breakfast', 'Breakfast', '🍳'],
    ['lunch',     'Lunch',     '🍱'],
    ['dinner',    'Dinner',    '🌙'],
    ['desserts',  'Desserts',  '🍮'],
    ['drinks',    'Drinks',    '🥤'],
];

const dishes = [
    // Breakfast (LKR)
    ['String Hoppers with coconut sambol and dhal curry', 'breakfast',  350,  IMG('sl_breakfast.png')],
    ['Hoppers with egg and spicy sambol',                 'breakfast',  250,  IMG('sl_breakfast.png')],
    ['Milk Rice served with lunu miris',                  'breakfast',  200,  IMG('sl_breakfast.png')],
    ['Pol Roti with katta sambol',                        'breakfast',  180,  IMG('sl_breakfast.png')],
    ['Pittu with coconut milk and curry',                 'breakfast',  300,  IMG('sl_breakfast.png')],
    ['Ulundu Vadai with chutney',                         'breakfast',  220,  IMG('sl_breakfast.png')],
    // Lunch (LKR)
    ['Rice and Curry (chicken, fish, dhal, beetroot & mallung)', 'lunch',  650, IMG('sl_lunch.png')],
    ['Lamprais wrapped in banana leaf',                   'lunch',      850,  IMG('sl_lunch.png')],
    ['Kottu Roti with chicken, cheese, or seafood',       'lunch',      750,  IMG('sl_lunch.png')],
    ['Devilled Chicken with fried rice',                  'lunch',      900,  IMG('sl_lunch.png')],
    ['Parippu Curry with steamed rice',                   'lunch',      450,  IMG('sl_lunch.png')],
    ['Fish Ambul Thiyal',                                 'lunch',      700,  IMG('sl_lunch.png')],
    // Dinner (LKR)
    ['Chicken Kottu',                                     'dinner',     750,  IMG('sl_dinner.png')],
    ['Seafood Nasi Goreng',                               'dinner',     950,  IMG('sl_dinner.png')],
    ['Chicken Fried Rice',                                'dinner',     700,  IMG('sl_dinner.png')],
    ['Cheese Roti with curry sauce',                      'dinner',     550,  IMG('sl_dinner.png')],
    ['String Hoppers with chicken curry',                 'dinner',     600,  IMG('sl_dinner.png')],
    ['Vegetable Curry with rice',                         'dinner',     500,  IMG('sl_dinner.png')],
    // Desserts (LKR)
    ['Watalappan',                                        'desserts',   350,  IMG('sl_desserts.png')],
    ['Curd and Treacle',                                  'desserts',   280,  IMG('sl_desserts.png')],
    ['Kokis',                                             'desserts',   200,  IMG('sl_desserts.png')],
    ['Kevum',                                             'desserts',   220,  IMG('sl_desserts.png')],
    ['Aasmi',                                             'desserts',   200,  IMG('sl_desserts.png')],
    ['Fruit Salad with Ice Cream',                        'desserts',   380,  IMG('sl_desserts.png')],
    // Drinks (LKR)
    ['Ceylon Tea',                                        'drinks',     150,  IMG('sl_drinks.png')],
    ['King Coconut',                                      'drinks',     200,  IMG('sl_drinks.png')],
    ['Faluda',                                            'drinks',     320,  IMG('sl_drinks.png')],
    ['Wood Apple Juice',                                  'drinks',     280,  IMG('sl_drinks.png')],
    ['Avocado Juice',                                     'drinks',     300,  IMG('sl_drinks.png')],
    ['Lime Juice',                                        'drinks',     200,  IMG('sl_drinks.png')],
];

async function migrate() {
    console.log('🍽  Starting Sri Lankan menu migration (LKR prices)...');
    try {
        // Clear existing data
        await run('DELETE FROM dish_ingredients');
        console.log('✅  Cleared dish_ingredients');
        await run('DELETE FROM dishes');
        console.log('✅  Cleared dishes');
        await run('DELETE FROM categories');
        console.log('✅  Cleared categories');

        // Seed categories
        for (const [id, name, icon] of categories) {
            await run('INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)', [id, name, icon]);
        }
        console.log(`✅  Inserted ${categories.length} categories`);

        // Seed dishes with LKR prices
        for (const [name, cat, price, image] of dishes) {
            await run(
                'INSERT INTO dishes (name, category_id, price, image) VALUES (?, ?, ?, ?)',
                [name, cat, price, image]
            );
        }
        console.log(`✅  Inserted ${dishes.length} dishes`);

        // Update currency to LKR
        await run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_symbol', 'Rs.')`);
        await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('business_name', 'TASTY OF ASCENDIA')`);
        await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', '10')`);
        console.log('✅  Currency set to LKR (Rs.)');

        console.log('\n🎉  Sri Lankan menu migration complete with LKR prices!');
    } catch (err) {
        console.error('❌  Migration failed:', err);
    } finally {
        db.close();
    }
}

migrate();
