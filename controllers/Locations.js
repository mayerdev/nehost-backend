const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Locations extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        return await db.Location.find().sort({ _id: -1 }).lean();
    }

    async save() {
        if(!this.data || !this.data._id) return this.send('FillFields', 400);

        await db.Location.updateOne({ _id: this.data._id }, this.data);
        
        return 'Success';
    }

    async create() {
        if(!this.data) return this.send('FillFields', 400);

        await db.Location.create(this.data);
        
        return 'Success';
    }
}