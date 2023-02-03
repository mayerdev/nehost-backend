const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Vtariffs extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        const tariffs = await db.Vtariff.find().sort({ _id: -1 }).lean();

        for(let item of tariffs) {
            item['node'] = await db.Node.findById(item.node_id).lean();
            item['node']['location'] = await db.Location.findById(item['node']['location_id']).lean();
        }

        return tariffs;
    }

    async save() {
        if(!this.data || !this.data._id) return this.send('FillFields', 400);

        await db.Vtariff.updateOne({ _id: this.data._id }, this.data);
        
        return 'Success';
    }

    async create() {
        if(!this.data) return this.send('FillFields', 400);

        await db.Vtariff.create(this.data);
        
        return 'Success';
    }
}