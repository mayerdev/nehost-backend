const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();
const { ObjectId } = require('mongodb');

module.exports = class Abuse extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if(!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

	async list() {
		return await db.Abuse.find().populate('user', '_id numId email').sort({ _id: -1 }).select('user title resolved').lean();
	}
	
	async view() {
        if(!this.data || !this.data._id) return this.send('FillFields', 400);

		return await db.Abuse.findById(this.data._id).select('text answer resolved').lean();
	}

	async create() {
        if(!this.data || !this.data.user || !this.data.title || !this.data.text) return this.send('FillFields', 400);
 
		const userQuery = {};
		if (ObjectId.isValid(this.data.user)) userQuery._id = new ObjectId(this.data.user);
		else if (!Number.isNaN(+this.data.user)) userQuery.numId = +this.data.user;
		else userQuery.email = this.data.user;

		const user = await db.User.findOne(userQuery).lean();
		this.data.user = user._id;

		await db.Abuse.create(this.data);
        
        return 'Success';
	}

	async save() {
		if(!this.data || !this.data._id || !this.data.user || !this.data.title || !this.data.text) return this.send('FillFields', 400);

		await db.Abuse.updateOne({ _id: this.data._id }, this.data);
        
        return 'Success';
	}

	async remove() {
		if(!this.data || !this.data._id) return this.send('FillFields', 400);

		await db.Abuse.deleteOne({ _id: this.data._id });
        
        return 'Success';
	}
}
