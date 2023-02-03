const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();
const { NodeSSH } = require('node-ssh');

async function unallocPort(port) {
    const ip = await db.Ip.findById(port.ip_id).lean();
    const subnet = await db.Subnet.findById(ip.subnet_id).lean();
    const node = await db.Node.findById(subnet.node_id).lean();

    const ssh = new NodeSSH();
    await ssh.connect({
        host: node.hostname,
        username: node.username,
        password: node.password,
        port: 22
    });

    await ssh.execCommand(`./del-port.sh ${port.port} ${ip.ip}:${port.localPort} tcp`, { cwd: '/root' });

    await db.Port.updateOne({ _id: port._id }, { $unset: {ip_id: 1, localPort: 1 }, allocated: false });
}

module.exports = class Ports extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        const ports = await db.Port.find().sort({ _id: -1 }).lean();

        for(let item of ports) {
            if(item.vserver_id) item['vserver'] = await db.Vserver.findById(item.vserver_id).lean();
            if(item.subnet_id) item['subnet'] = await db.Subnet.findById(item.subnet_id).lean();
            if(item.ip_id) item['ip'] = await db.Ip.findById(item.ip_id).lean();
        }

        return ports;
    }

    async alloc() {
        if(!this.data) return this.send('FillFields', 400);

        for(let i = this.data.start; i <= this.data.end; i++) {
            await db.Port.create({ subnet_id: this.data.subnet_id, port: i });
        }

        return 'Success';
    }

    async free() {
        if(!this.data) return this.send('FillFields', 400);

        const port = await db.Port.findById(this.data).lean();
        if(!port) return this.send('NoPort', 404);

        await unallocPort(port);

        return 'Success';
    }
}