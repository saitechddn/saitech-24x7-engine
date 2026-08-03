const WebSocket = require('ws');
const axios = require('axios');

// ⚙️ CONFIGURATION
const GOOGLE_SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzR7X42lOgTTDi3z9BV_k75hPukWxXomTUKssydEQc7fQMAFI3wsbSYsrUSyWPgcH3A8g/exec";
const PAIRS = ['paxgusdt', 'btcusdt', 'ethusdt']; // 24x7 Live Crypto Pairs

let activeTrades = {}; // Background Trade Tracker

console.log("🚀 Saitech 24/7 Engine Initialized...");

// Connect Live WebSocket Streams
PAIRS.forEach(pair => {
    connectStream(pair);
});

function connectStream(pair) {
    // US-friendly Binance Stream Endpoint (Bypasses 451 Region Error)
    const ws = new WebSocket(`wss://stream.binance.us:9443/ws/${pair}@kline_1m`);

    ws.on('open', () => {
        console.log(`🟢 Connected to Live Stream: ${pair.toUpperCase()}`);
    });

    ws.on('message', (data) => {
        const parsed = JSON.parse(data);
        if (parsed && parsed.k) {
            const price = parseFloat(parsed.k.c);
            processSMCLogic(pair.toUpperCase(), price);
        }
    });

    ws.on('close', () => {
        console.log(`⚠️ Stream Closed for ${pair}. Reconnecting in 3 seconds...`);
        setTimeout(() => connectStream(pair), 3000);
    });

    ws.on('error', (err) => {
        console.error(`❌ WS Error on ${pair}:`, err.message);
    });
}

async function processSMCLogic(symbol, currentPrice) {
    const tf = "15M";
    const tradeKey = `${symbol}_${tf}`;

    // 1. If Trade is Active -> Check Outcome (WIN/LOSS)
    if (activeTrades[tradeKey]) {
        const trade = activeTrades[tradeKey];
        let status = null;

        if (trade.type === "BUY") {
            if (currentPrice >= trade.tp) status = "WIN";
            else if (currentPrice <= trade.sl) status = "LOSS";
        } else if (trade.type === "SELL") {
            if (currentPrice <= trade.tp) status = "WIN";
            else if (currentPrice >= trade.sl) status = "LOSS";
        }

        if (status) {
            console.log(`🎯 Trade Completed [${tradeKey}]: ${status}`);
            delete activeTrades[tradeKey]; // Clear Lock
        }
        return;
    }

    // 2. Dynamic SMC Risk Setup Logic
    const atrRisk = currentPrice * 0.0020;
    const isBullish = true; 

    const entry = currentPrice.toFixed(2);
    const sl = (isBullish ? currentPrice - atrRisk : currentPrice + atrRisk).toFixed(2);
    const tp = (isBullish ? currentPrice + (atrRisk * 1.5) : currentPrice - (atrRisk * 1.5)).toFixed(2);

    // Lock Trade in Memory
    activeTrades[tradeKey] = {
        symbol, tf, entry: parseFloat(entry), sl: parseFloat(sl), tp: parseFloat(tp),
        type: isBullish ? "BUY" : "SELL", timestamp: Date.now()
    };

    console.log(`⚡ New 24x7 Trade Triggered: ${symbol} ${tf} @ ${entry}`);

    // Send Payload to Google Apps Script
    try {
        await axios.post(GOOGLE_SHEET_WEBAPP_URL, {
            asset: symbol,
            tf: tf,
            entry: entry,
            sl: sl,
            tp: tp
        });
        console.log(`✅ Successfully logged to Google Sheet!`);
    } catch (err) {
        console.error(`❌ Google Sheet Sync Failed:`, err.message);
    }
}
