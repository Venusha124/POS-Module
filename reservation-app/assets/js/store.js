const API_URL = '/api';

const store = {
    data: {
        customers: [],
        eventRooms: [],
        reservations: [],
        inquiries: [],
        settings: { business_name: 'IMPERIAL', currency_symbol: 'Rs.' }
    },

    async fetchAPI(endpoint, options = {}) {
        const url = `${API_URL}${endpoint}`;
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return response;
    },

    async init() {
        await this.refreshData();
    },

    async refreshData() {
        try {
            const [customers, eventRooms, reservations, inquiries] = await Promise.all([
                this.fetchAPI('/customers').then(r => r.json()),
                this.fetchAPI('/event-rooms').then(r => r.json()),
                this.fetchAPI('/reservations').then(r => r.json()),
                this.fetchAPI('/inquiries').then(r => r.json())
            ]);
            this.data.customers    = customers;
            this.data.eventRooms   = eventRooms;
            this.data.reservations = reservations;
            this.data.inquiries    = inquiries;
            window.dispatchEvent(new CustomEvent('store_updated'));
        } catch (error) {
            console.error('Store refresh error:', error);
        }
    }
};
