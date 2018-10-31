var SmartBus = require('smart-bus');

module.exports = function(RED) {
    function BusproControllerNode(n) {
        RED.nodes.createNode(this,n);
        this.host = n.host;
        this.port = n.port || 6000;
        this.deviceid = parseInt(n.subnetid)+"."+parseInt(n.deviceid);
        var node = this;
		this.bus = new SmartBus({
  			device: node.deviceid,      // Connector address in HDL network (subnet.id)
  			gateway: node.host, 		// HDL SmartBus gateway IP
  			port: node.port             // and port, default: 6000
        });
        this.bus.on('command',(c)=>{
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
            // console.log(eventSender,'=>' ,eventTarget);
        });
		this.on("close",()=>{
			this.bus.removeAllListeners();
		    this.bus.socket.close();
		})        
    }
    RED.nodes.registerType("buspro-controller",BusproControllerNode);


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
        const controller = RED.nodes.getNode(config.controller);
        this.recivedCommand = (command)=>{
        	var msg = {};
		  	msg.sender = command.sender.subnet + "." + command.sender.id;
		  	msg.target = command.target.subnet + "." + command.target.id;
		  	msg.code = command.code;
		  	msg.payload = command.data;
            msg.topic = 'BusPro';
		  	this.send(msg);
        };
        
        controller.on(eventName, this.recivedCommand);

		this.on("close", ()=>{
            controller.removeListener(eventName,this.recivedCommand);
		});
    }
    RED.nodes.registerType("buspro-in",BusproIn);

    function BusproOut(config) {
        RED.nodes.createNode(this,config);
        var controller = RED.nodes.getNode(config.controller);
        this.bus = controller.bus;
        var node = this;
        this.on('input', (msg)=>{
            if (!msg.target || !msg.code){
                node.error("Required parameters msg.target and msg.code");
                return;
            }
            node.bus.send(msg.target, msg.code, msg.payload, function(err) {
                if (err){
                    node.error(err);   
                }
            });
        });
       
        this.on("close", ()=>{

        });
    }
    RED.nodes.registerType("buspro-out",BusproOut);


}

