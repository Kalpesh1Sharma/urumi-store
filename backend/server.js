const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const LOG_LIMIT = 50;
let systemLogs = []; 

// --- SCALING CONFIGURATION ---
const CONCURRENCY_LIMIT = 2; // Only run 2 heavy Helm commands at once
let activeProvisioningTasks = 0;
const provisioningQueue = []; // Queue for pending requests

// --- HELPERS ---
const logSystemEvent = (type, message, storeId = null) => {
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type, message, storeId
    };
    systemLogs.unshift(entry);
    if (systemLogs.length > LOG_LIMIT) systemLogs.pop();
    console.log(`[${type}] ${message}`);
};

const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) { console.error(`Error: ${error.message}`); reject(error.message); return; }
            if (stderr) console.warn(`Stderr: ${stderr}`);
            resolve(stdout);
        });
    });
};

const getStoreNamespace = async (storeId) => {
    try {
        const output = await runCommand(`helm list -A -o json`);
        const releases = JSON.parse(output);
        const store = releases.find(r => r.name === storeId);
        return store ? store.namespace : null;
    } catch (e) { return null; }
};

// --- QUEUE PROCESSOR (The Scaling Engine) ---
const processQueue = async () => {
    // If we are busy or queue is empty, stop.
    if (activeProvisioningTasks >= CONCURRENCY_LIMIT || provisioningQueue.length === 0) return;

    // Take next item
    const task = provisioningQueue.shift();
    activeProvisioningTasks++;

    const { storeId, host, chartPath, res } = task;

    logSystemEvent('INFO', `⚡ Processing queue item: ${storeId} (Active: ${activeProvisioningTasks})`, storeId);

    const helmCommand = `helm install ${storeId} "${chartPath}" --create-namespace --namespace ${storeId} --set store.name=${storeId} --set ingress.host=${host} --set persistence.enabled=true`;

    try {
        await runCommand(helmCommand);
        logSystemEvent('SUCCESS', `Successfully provisioned ${storeId}`, storeId);
        // Since we delayed the response, we assume the client is polling or we confirm "Started" earlier.
        // But to keep it simple for this REST API, we rely on the Frontend polling logs.
    } catch (err) {
        logSystemEvent('ERROR', `Provisioning failed: ${err}`, storeId);
    } finally {
        activeProvisioningTasks--;
        processQueue(); // Check for next item
    }
};

// --- ENDPOINTS ---

app.get('/api/logs', (req, res) => res.json(systemLogs));
app.get('/api/stores', async (req, res) => {
    try {
        const output = await runCommand('helm list -A -o json');
        res.json(JSON.parse(output));
    } catch (err) { res.status(500).json({ error: err }); }
});

// CREATE STORE (Queue-based)
app.post('/api/stores', async (req, res) => {
    const { storeName } = req.body;
    // Removing random ID for Idempotency test (add back if needed)
    const storeId = storeName.toLowerCase().replace(/[^a-z0-9-]/g, '-'); 
    const host = `${storeId}.localhost`;

    // 1. IDEMPOTENCY CHECK
    const existingNamespace = await getStoreNamespace(storeId);
    if (existingNamespace) {
        logSystemEvent('INFO', `Store ${storeId} already exists.`, storeId);
        return res.json({ status: 'success', message: 'Store already exists', storeId });
    }

    // 2. QUEUEING (Scaling Logic)
    const chartPath = path.resolve(__dirname, '../urumi-platform/woocommerce-store');
    
    // Add to Queue
    provisioningQueue.push({ storeId, host, chartPath, res });
    
    const msg = `Request queued. Position: ${provisioningQueue.length}`;
    logSystemEvent('INFO', msg, storeId);
    
    // Respond immediately so UI doesn't freeze
    res.json({ status: 'queued', message: msg, storeId });

    // Trigger Processor
    processQueue();
});

// DELETE
app.delete('/api/stores/:id', async (req, res) => {
    const storeId = req.params.id;
    logSystemEvent('WARNING', `Teardown requested for ${storeId}`, storeId);
    try {
        const namespace = await getStoreNamespace(storeId);
        if (!namespace) return res.status(404).json({ message: "Store not found" });

        await runCommand(`helm uninstall ${storeId} --namespace ${namespace}`);
        if (namespace === storeId && namespace !== 'default') {
             runCommand(`kubectl delete namespace ${namespace}`).catch(e => console.error(e));
        }
        logSystemEvent('SUCCESS', `Teardown complete for ${storeId}`, storeId);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err });
    }
});

// UPGRADE
app.post('/api/stores/:id/upgrade', async (req, res) => {
    const storeId = req.params.id;
    logSystemEvent('INFO', `Upgrade requested for ${storeId}`, storeId);
    try {
        const namespace = await getStoreNamespace(storeId);
        const chartPath = path.resolve(__dirname, '../urumi-platform/woocommerce-store');
        await runCommand(`helm upgrade ${storeId} "${chartPath}" --namespace ${namespace} --reuse-values --set wordpress.image=wordpress:6.5.0-apache`);
        logSystemEvent('SUCCESS', `Upgraded ${storeId}`, storeId);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.toString() });
    }
});

// ROLLBACK
app.post('/api/stores/:id/rollback', async (req, res) => {
    const storeId = req.params.id;
    logSystemEvent('WARNING', `Rollback requested for ${storeId}`, storeId);
    try {
        const namespace = await getStoreNamespace(storeId);
        await runCommand(`helm rollback ${storeId} 0 --namespace ${namespace}`);
        logSystemEvent('SUCCESS', `Rolled back ${storeId}`, storeId);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`Orchestrator running on http://localhost:${PORT}`);
});