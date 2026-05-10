const http = require('http');

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ data: parsed, status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300 });
                } catch (e) {
                    resolve({ data, status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300 });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    const headers = { 'Content-Type': 'application/json', 'x-user-id': '1', 'x-user-role': 'admin' };
    const host = 'localhost';
    const port = 3000;

    try {
        console.log("1. Creating a table...");
        const tableRes = await request({ host, port, path: '/api/tables', method: 'POST', headers }, { name: 'TestTable', seats: 4 });
        const tableId = tableRes.data.id;
        console.log(`Table created with ID: ${tableId}`);

        console.log("2. Creating an order for the table...");
        const orderRes = await request({ host, port, path: '/api/orders', method: 'POST', headers }, {
            items: [{ dish: { id: 1, name: 'Test Dish', price: 10 }, qty: 1 }],
            total: 10,
            orderType: 'Dine In',
            paymentMethod: 'Cash',
            table_id: tableId,
            customer_id: 1
        });
        const orderId = orderRes.data.id;
        console.log(`Order created with ID: ${orderId}`);

        console.log("3. Checking table status (should be Occupied)...");
        let tableCheck = await request({ host, port, path: '/api/tables', method: 'GET', headers });
        let table = tableCheck.data.find(t => t.id === tableId);
        console.log(`Table status: ${table.status}`);

        console.log("4. Completing the order...");
        await request({ host, port, path: `/api/orders/${orderId}/status`, method: 'PATCH', headers }, { status: 'Completed' });
        console.log("Order completed.");

        console.log("5. Checking table status (should be Dirty)...");
        tableCheck = await request({ host, port, path: '/api/tables', method: 'GET', headers });
        table = tableCheck.data.find(t => t.id === tableId);
        console.log(`Table status: ${table.status}`);

        if (table.status === 'Dirty') {
            console.log("SUCCESS: Table is Dirty.");
        } else {
            console.log(`FAILURE: Table is ${table.status}.`);
        }

    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

test();
