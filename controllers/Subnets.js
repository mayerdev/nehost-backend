const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Subnets extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        const subnets = await db.Subnet.find().sort({ _id: -1 }).lean();

        for(let item of subnets) item['node'] = await db.Node.findById(item.node_id).lean();

        return subnets;
    }

    async view() {
        if(!this.data) return this.send('FillFields', 400);

        const ips = await db.Ip.find({ subnet_id: this.data }).lean();

        for(let item of ips) {
            if(item.vserver_id) {
                const vserver = await db.Vserver.findById(item.vserver_id).lean();
                if(vserver) item['vserver'] = vserver;
            }
        }

        return ips;
    }

    async toggle() {
        if(!this.data) return this.send('FillFields', 400);

        const ip = await db.Ip.findById(this.data).lean();
        if(!ip) return this.send('NotFound', 404);

        await db.Ip.updateOne({ _id: ip._id }, { reserved: !ip.reserved });

        return 'Success';
    }

    async create() {
        if(!this.data || !this.data.subnet || !this.data.start || !this.data.end) return this.send('FillFields', 400);
        
        const create = await db.Subnet.create(this.data);

        for(let i = this.data.start; i <= this.data.end; i++) {
            await db.Ip.create({ subnet_id: create._id, ip: `${this.data.subnet}.${i}`});
        }
        
        return 'Success';
    }
}