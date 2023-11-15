// Import the WebSocket library

const task = Deno.args[0];
const filepath = Deno.args[1];

const CONFIG = JSON.parse(await Deno.readTextFile(filepath));

const PORT = CONFIG.port;
const DOMAIN = CONFIG.domain;
const KEY = CONFIG.key;
const TARGET = CONFIG.target;

const LIVE_DOMAIN = TARGET || "stream-my-site.deno.dev";

const URL = `wss://${LIVE_DOMAIN}/`;

switch (task) {
    case "connect":
        handleConnect();
        break;

    case "signoff":
        handleDisconnect();
        break;
    
    default:
        throw new Error(`invalid task: ${task};`)
}

function handleConnect(){

    try {
        const ws = new WebSocket(URL);
        ws.onopen = () => handleConnected(ws);
        ws.onmessage = async (m) => await handleMessage(ws, m.data);
        ws.onclose = () => logError("Disconnected from server ...");
        ws.onerror = (e) => handleError(e);
    } catch (err: unknown) {
        logError(`${err}`);
    }
}

function handleDisconnect(){
    try {
        const ws = new WebSocket(URL);
        ws.onopen = () => {
            ws.send(preProcess({
                context: "signoff"
            }));
        }
        ws.onmessage = (data) => handleMessage( ws, data as unknown as string);
        ws.onclose = () => logError("Disconnected from server ...");
        ws.onerror = (e) => handleError(e);
    } catch (err: unknown) {
        logError(`${err}`);
    }
}

function logError(msg: string) {
    throw new Error(msg);
}


function preProcess(data:Record<string, unknown>) {
        return JSON.stringify({...data, key: KEY, domain: DOMAIN})
}  

function handleConnected(ws: WebSocket) {
    ws.send(preProcess({
        "context": "init"
    }));
}

async function handleRequest(ws: WebSocket, request:any) {

    const response = await fetch(`http://localhost:${PORT}${request.path}`, {
        method: request.method,
        body: request.body,
        headers: request.headers,
    });

    ws.send(preProcess({
        context: "handler",
        status: response.status,
        statusText: response.statusText,
        client: request.client,
        body: await response.text(),
        headers: [...response.headers.entries()].reduce<Record<string, string>>((prev, entry)=>{
            prev[entry[0]] = entry[1];
            return prev;
        }, {})
    }));
}

async function handleMessage(ws: WebSocket, data: string) {
    const request = JSON.parse(data);

    console.log({request})

    switch (request.context) {

        case "handler":
            await handleRequest(ws, request);
            return;

        case "init":
            if (request.error){
                throw new Error(`${request}`);
            } else {
                console.log(`deployed to https://${LIVE_DOMAIN}/${DOMAIN}`)
            }
            return;   

        case "signoff":
            if (request.error){
                throw new Error(`${request}`);
            } else {
                console.log(`signoff https://${LIVE_DOMAIN}/${DOMAIN} successful`)
            }
            break;
            
        default:
            break;
    }

}

function handleError(e: Event | ErrorEvent) {
    console.log(e instanceof ErrorEvent ? e.message : e.type);
}
