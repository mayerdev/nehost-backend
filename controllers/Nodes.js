const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Nodes extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        const nodes = await db.Node.find().sort({ _id: -1 }).lean();;

        for(let item of nodes) item['location'] = await db.Location.findById(item.location_id).lean();

        return nodes;
    }

    async save() {
        if(!this.data || !this.data._id) return this.send('FillFields', 400);

        await db.Node.updateOne({ _id: this.data._id }, this.data);
        
        return 'Success';
    }

    async create() {
        if(!this.data) return this.send('FillFields', 400);

        await db.Node.create(this.data);
        
        return 'Success';
    }
}