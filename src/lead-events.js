'use strict';
const {EventEmitter}=require('node:events');
const events=new EventEmitter();
function onNewLead(handler) {
    const listener=()=>{Promise.resolve().then(handler).catch(()=>console.error('Avisos: processamento adiado; a fila permanece guardada.'));};
    events.on('created',listener);
    return ()=>events.off('created',listener);
}
function notifyNewLead() { events.emit('created'); }
module.exports={onNewLead,notifyNewLead};
