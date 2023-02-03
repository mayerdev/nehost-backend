const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Promo extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

	async list() {
		return await db.Promo.find().sort({ _id: -1 }).lean();
	}

	async create() {
        if(!this.data || !this.data._id || !this.data.usage || !this.data.percent) return this.send('FillFields', 400);

		await db.Promo.create(this.data);
        
        return 'Success';
	}

	async save() {
		if(!this.data || !this.data._id || !this.data.usage || !this.data.percent) return this.send('FillFields', 400);

		await db.Promo.updateOne({ _id: this.data._id }, this.data);
        
        return 'Success';
	}

	async remove() {
		if(!this.data || !this.data._id) return this.send('FillFields', 400);

		await db.Promo.deleteOne({ _id: this.data._id });
        
        return 'Success';
	}
}
