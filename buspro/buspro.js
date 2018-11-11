var SmartBus = require('smart-bus');

module.exports = function(RED) {

// Global functions 
    function isInt(value) {
        if (isNaN(value)) {
            return false;
        }
        var x = parseFloat(value);
        return (x | 0) === x;
    };
    function isDeviceAddres(address){
        if (typeof address != 'string') return false;
        const [subnet, id] = address.split(".").map((v)=>parseInt(v));
        if (!isInt(subnet) || !isInt(id)) return false;
        return true;
    };

// BusPro controller 
    function BusproControllerNode(n) {
        RED.nodes.createNode(this,n);
        this.host = n.host;
        this.port = n.port || 6000;
        this.deviceid = parseInt(n.subnetid)+"."+parseInt(n.deviceid);
        var node = this;
		const bus = new SmartBus({
  			device: node.deviceid,      // Connector address in HDL network (subnet.id)
  			gateway: node.host, 		// HDL SmartBus gateway IP
  			port: node.port             // and port, default: 6000
        });
        bus.on('command',(c)=>{
            const eventSender = ['sender', c.sender.subnet, c.sender.id].join('.');
            const eventTarget = ['target', c.target.subnet, c.target.id].join('.');
            const msg = {
                sender: {subnet:c.sender.subnet,id:c.sender.id},
                target: {subnet:c.target.subnet,id:c.target.id},
                code: c.code,
                data: c.data
            };
            this.emit('all',msg);
            this.emit(eventSender,msg);
            this.emit(eventTarget,msg);
        });
        this.send = function(target, code, payload, callback){
            return bus.send(target, code, payload, callback);
        };
        this.sendAs = function( sender, target, code, payload, callback){
            var cBus = Object.create(bus);
            const [senderSubnet, SenderId] = sender.split('.'); 
            cBus.subnet = senderSubnet;
            cBus.id = SenderId;
            return cBus.send(target, code, payload, callback);
        };
		this.on("close",()=>{
			bus.removeAllListeners();
		    bus.socket.close();
        });
                
    }
    RED.nodes.registerType("buspro-controller",BusproControllerNode);

// BusPro node IN
    function BusproIn(config) {
        RED.nodes.createNode(this,config);
        var eventName = 'all';
        switch (config.filter){
            case 'all':
                eventName = 'all';
                break;
            case 'broadcast':
                eventName = ['target',255,255].join('.');
                break;
            case 'sender':
                eventName = ['sender',config.subnetid,config.deviceid].join('.');
                break;
            case 'target':
                eventName = ['target',config.subnetid,config.deviceid].join('.');
                break;
            default:
                eventName = 'all'
                break;
        };
        config.commands = config.commands || "";
        var cods = [];
        config.commands.split(',').forEach(v => {
            if (isInt(v)){
                cods.push(parseInt(v))
            }
        });
        const controller = RED.nodes.getNode(config.controller);
        this.recivedCommand = (command)=>{
            if (cods.length>0 && cods.indexOf(command.code)<0){
                return;
            };
        	var msg = {};
		  	msg.sender = [command.sender.subnet, command.sender.id].join('.');
		  	msg.target = [command.target.subnet, command.target.id].join('.');
		  	msg.code = command.code;
		  	msg.payload = command.data;
            msg.topic = [
                'buspro',
                msg.sender,
                msg.target,
                msg.code
            ].join('/');
		  	this.send(msg);
        };
        controller.on(eventName, this.recivedCommand);

		this.on("close", ()=>{
            controller.removeListener(eventName,this.recivedCommand);
        });
    }
    RED.nodes.registerType("buspro-in",BusproIn);

// BusPro node OUT
    function BusproOut(config) {
        RED.nodes.createNode(this,config);
        const controller = RED.nodes.getNode(config.controller);
        this.on('input', (msg)=>{
            if (!isDeviceAddres(msg.target)){
                this.error("Required parameters msg.target ");
                return;
            };
            if ( !isInt (msg.code)){
                this.error("Required parameters msg.code");
                return;
            };
            if (isDeviceAddres(msg.sender)){
                controller.sendAs(msg.sender, msg.target, msg.code, msg.payload, (err)=>{
                    if (err) this.error(err);
                });
            }else{
                controller.send(msg.target, msg.code, msg.payload, (err)=>{
                    if (err) this.error(err);
                });
            }
        });
       
        this.on("close", ()=>{

        });
    }
    RED.nodes.registerType("buspro-out",BusproOut);
}
