var events = new (Npm.require('events').EventEmitter)(),
	collectionName = process.env.MULTIPLE_INSTANCES_COLLECTION_NAME || 'instances',
	defaultPingInterval = 2000; // 2s

var Instances = new Meteor.Collection(collectionName);

Instances._ensureIndex({_updatedAt: 1}, {expireAfterSeconds: 60});

InstanceStatus = {
	name: undefined,
	extraInformation: undefined,

	events: events,

	getCollection: function() {
		return Instances;
	},

	registerInstance: function(name, extraInformation) {
		InstanceStatus.name = name;
		InstanceStatus.extraInformation = extraInformation;

		if (InstanceStatus.id() === undefined || InstanceStatus.id() === null) {
			return console.error('[multiple-instances-status] only can be called after Meteor.startup');
		}

		var now = new Date(),
			instance = {
				$set: {
					pid: process.pid,
					name: name
				},
				$currentDate: {
					_createdAt: true,
					_updatedAt: true
				}
			};

		if (extraInformation) {
			instance.$set.extraInformation = extraInformation;
		}

		try {
			Instances.upsert({_id: InstanceStatus.id()}, instance);
			var result = Instances.findOne({_id: InstanceStatus.id()});
			InstanceStatus.start();

			events.emit('registerInstance', result, instance);

			return result;
		} catch (e) {
			return e;
		}
	},

	unregisterInstance: function() {
		try {
			var result = Instances.remove({_id: InstanceStatus.id()});
			InstanceStatus.stop();

			events.emit('unregisterInstance', InstanceStatus.id());

			return result;
		} catch (e) {
			return e;
		}
	},

	start: function(interval) {
		InstanceStatus.stop();

		interval = interval || defaultPingInterval;

		InstanceStatus.interval = Meteor.setInterval(function() {
			InstanceStatus.ping();
		}, interval);
	},

	stop: function(interval) {
		if (InstanceStatus.interval) {
			InstanceStatus.interval.close();
			delete InstanceStatus.interval;
		}
	},

	ping: function() {
		var count = Instances.update(
			{
				_id: InstanceStatus.id()
			},
			{
				$currentDate: {
					_updatedAt: true
				}
			});

		if (count === 0) {
			InstanceStatus.registerInstance(InstanceStatus.name, InstanceStatus.extraInformation);
		}
	},

	onExit: function() {
		InstanceStatus.unregisterInstance();
	},

	activeLogs: function() {
		Instances.find().observe({
			added: function(record) {
				var log = '[multiple-instances-status] Server connected: ' + record.name + ' - ' + record._id;
				if (record._id == InstanceStatus.id()) {
					log += ' (me)';
				}
				console.log(log.green);
			},
			removed: function(record) {
				var log = '[multiple-instances-status] Server disconnected: ' + record.name + ' - ' + record._id;
				console.log(log.red);
			}
		});
	},

	id: function() {}
};

Meteor.startup(function() {
	var ID = Random.id();

	InstanceStatus.id = function() {
		return ID;
	};
});
