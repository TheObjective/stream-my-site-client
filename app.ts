// Import the WebSocket library
interface ClientRequest {
    context: string,
    client: string,
    path: string,
    content: string,
    method: string,
    headers: string[][], //Record<string, string>, 
    status: number,
    statusText: string
} 
const task = Deno.args[0];
const filepath = Deno.args[1];
const CONFIG = JSON.parse(await Deno.readTextFile(filepath));

const PORT = CONFIG.port;
const DOMAIN = CONFIG.domain;
const KEY = CONFIG.key;
const TARGET = CONFIG.target;

const LIVE_DOMAIN = TARGET || "stream-my-site.deno.dev";
const s = (LIVE_DOMAIN.includes(":"))? "": "s";
const URL = `ws${s}://${LIVE_DOMAIN}/`;
const LIVE_URL = `http${s}://${LIVE_DOMAIN}`;

const DEPLOYED = {
    scheme: `http${s}`,
    url: `${LIVE_DOMAIN}`
}

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
        ws.onerror = (e) => {
            console.error(e)
            throw e;
        };
    } catch (err: unknown) {
        throw new Error(`${err}`);
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
        ws.onmessage = (data) => handleMessage(ws, data as unknown as string);
        ws.onclose = () => logError("Disconnected from server ...");
        ws.onerror = (e) => handleError(e);
    } catch (err: unknown) {
        logError(`..... ${err}`);
    }
}

function logError(msg: string) {
    console.error("LOG.....", msg);
    // throw new Error(msg);
}


function preProcess(data:Record<string, unknown>) {
        return JSON.stringify({...data, key: KEY, domain: DOMAIN})
}  

function handleConnected(ws: WebSocket) {
    ws.send(preProcess({
        "context": "init"
    }));
}

async function handleRequest(ws: WebSocket, request:ClientRequest) {
    console.log(`\n\n-------------------------- HANDLING ${request.path} -------------------------------------------------------`)

    const requestHeaders = request.headers.map(([key, val])=>{
        const value = val
                        .replaceAll(`${DEPLOYED.scheme}://${DEPLOYED.url}`, `http://localhost:${PORT}`)
                        .replaceAll(`${DEPLOYED.scheme}://${LIVE_DOMAIN}`, `http://localhost:${PORT}`)
                        .replaceAll(`${DEPLOYED.url}`, `localhost:${PORT}`)
                        .replaceAll(`${LIVE_DOMAIN}`, `localhost:${PORT}`)
                        ;
        if (value!=val){
            console.log({
                type: "request",
                from: val,
                key,
                to: value
            })
        }                    
        return [key, value];                   
    });
    console.log({requestHeaders});

    const response = await fetch(`http://localhost:${PORT}${request.path}`, {
        method: request.method,
        body: request.content,
        headers: requestHeaders,
    });
    
    const responseHeaders = [...response.headers.entries()].reduce<Record<string, string[]>>((prev, entry)=>{

        const value = entry[1]
                            .replaceAll(`http://localhost:${PORT}`, `${DEPLOYED.scheme}://${DEPLOYED.url}`)
                            .replaceAll(`localhost:${PORT}`, `${DEPLOYED.url}`);

        if (value!=entry[1]){
            console.log({
                type: "response",
                key: entry[0],
                from: entry[1],
                to: value
            })
        }      
        if (prev[entry[0]]){
            prev[entry[0]].push(value);            
        } else {
            prev[entry[0]] = [value];            
        }             
        return prev;
    }, {});
    // responseHeaders["access-control-allow-origin"] = `*`;//`${DEPLOYED.scheme}://${DEPLOYED.url}`;
    // responseHeaders["origin"] = `${DEPLOYED.scheme}://${DEPLOYED.url}`;
    // responseHeaders["host"] = `${DEPLOYED.url}`;
    // // headers["access-control-allow-origin"] = `${DEPLOYED.scheme}://${DEPLOYED.url}`;
    // responseHeaders["vary"] = "Origin";
    // responseHeaders["access-control-allow-credentials"] = "true";
    let body = null;
    try {
        if (!([204, 304].includes(response.status) || `${response.status}`.startsWith('3'))){
            body = await response.text() || await response.arrayBuffer() || await response.blob() || "";
        }
    } catch {
        // 
    }

    try {

        console.log({returnHeaders: responseHeaders})
        ws.send(preProcess({
            context: "handler",
            status: response.status,
            statusText: response.statusText,
            client: request.client,
            body,
            headers: responseHeaders
        }));
            
    } catch (error) {
        console.error(error);
    }

    console.log(`\n\n-------------------------- FINISHED ${request.path} -------------------------------------------------------\n\n`)

}

async function handleMessage(ws: WebSocket, data: string) {
    const request = JSON.parse(data);
    console.log({request})
    switch (request.context) {

        case "handler":
            try {
                await handleRequest(ws, request);
            } catch (error) {
                ws.send(preProcess({
                    context: "handler",
                    status: 500,
                    client: request.client,
                    body: `an error has occured: ${error}`,
                    headers: {}
                }));
                throw error;
            }
            
            return;

        case "init":
            if (request.error){
                throw new Error(`${request}`);
            } else {
                console.log(`deployed to ${LIVE_URL}?site=${DOMAIN}`)
            }
            return;   

        case "signoff":
            if (request.error){
                throw new Error(`${request}`);
            } else {
                console.log(`signoff to ${LIVE_URL}?site=${DOMAIN} successful`)

            }
            break;
            
        default:
            break;
    }

}

function handleError(e: Event | ErrorEvent) {
    console.log( e instanceof ErrorEvent ? e.message : e.type);
}