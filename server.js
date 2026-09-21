const express = require('express');
const Database = require('better-sqlite3');
const app = express();
// process.env.PORT allows Render to automatically assign a port, falling back to 3000 locally
const port = process.env.PORT || 3000; 

app.use(express.json());
app.use(express.static('public')); 

// Initialize SQLite Database synchronously
const db = new Database('./database.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        sensor_id INTEGER, 
        pressure_psi REAL, 
        timestamp INTEGER 
    )
`);

let connectedClients = [];
let pendingCommands = []; // Cloud memory array to hold commands

// SSE Stream for live chart data
app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // CRITICAL FOR RENDER: Tell the cloud proxy to establish the stream immediately
    res.flushHeaders(); 
    res.write(':\n\n'); // Send an invisible heartbeat ping
    
    connectedClients.push(res);
    req.on('close', () => connectedClients = connectedClients.filter(c => c !== res));
});

// Ingest data from Python
app.post('/api/data', (req, res) => {
    const data = req.body;
    
    // Broadcast to Chart.js via SSE
    connectedClients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));

    if (data.pressure_psi < 30.0 && data.pressure_psi > 0) {
        const stmt = db.prepare("INSERT INTO anomalies (sensor_id, pressure_psi, timestamp) VALUES (?, ?, ?)");
        stmt.run(data.sensor_id, data.pressure_psi, data.timestamp * 1000);
        console.log(`🚨 Logged anomaly for Sensor ${data.sensor_id}`);
    }
    res.sendStatus(200);
});

// Receive dynamic command (SHUTOFF or OPEN) from HTML
app.post('/api/command', (req, res) => {
    const { action, sensor_id } = req.body;
    const command = `${action}_${sensor_id}`;
    
    pendingCommands.push(command); // Store in cloud memory instead of file
    
    console.log(`Cloud received: ${command}. Queued for hardware.`);
    res.json({ status: 'Command Queued in Cloud' });
});

// NEW: Python Edge Device polls this endpoint to retrieve pending commands
app.get('/api/poll-commands', (req, res) => {
    res.json({ commands: pendingCommands });
    pendingCommands = []; // Clear the queue immediately after Python reads them
});

// Fetch historical data for dashboard
app.get('/api/history', (req, res) => {
    const rows = db.prepare("SELECT * FROM anomalies ORDER BY timestamp DESC LIMIT 10").all();
    res.json(rows);
});

app.listen(port, () => console.log(`Smart Grid Server running at port ${port}`));
