// Defines the given entity as a Level
define(['ash'], function (Ash) {
	
	let LevelComponent = Ash.Class.extend({
		
		position: 13,
		isCampable: false,
		isHard: false,
		notCampableReason: null,
		districts: [], // DistrictVO
		features: [],
		minX: 0,
		maxX: 0,
		minY: 0,
		maxY: 0,

		habitability: 1, // 0 for no camp, 0.5 outpost, 1 normal, >1 capital
		diseaseFrequecyFactor: 1,
		raidDangerFactor: 1,
		traderFrequencyFactor: 1,
		signatureDisaster: null, // CampConstants.DISASTER_TYPE_ or null

		workerMetalFactor: 1,
		workerFoodFactor: 1,
		workerWaterFactor: 1,
		workerArtisanFactor: 1,
		workerAcademicFactor: 1,
		workerHopeFactor: 1,
		
		constructor: function (pos, isCampable, isHard, notCampableReason, districts, features, minX, maxX, minY, maxY, attributes) {
			this.position = pos;
			this.isCampable = isCampable;
			this.isHard = isHard;
			this.notCampableReason = notCampableReason;
			this.districts = districts;
			this.features = features;

			this.minX = minX;
			this.maxX = maxX;
			this.minY = minY;
			this.maxY = maxY;

			this.habitability = attributes.habitability || 1;
			this.diseaseFrequecyFactor = attributes.diseaseFrequecyFactor || 1;
			this.raidDangerFactor = attributes.raidDangerFactor || 1;
			this.traderFrequencyFactor = attributes.traderFrequencyFactor || 1;
			this.signatureDisaster = attributes.signatureDisaster || null;

			this.workerMetalFactor = attributes.workerMetalFactor || 1;
			this.workerFoodFactor = attributes.workerFoodFactor || 1;
			this.workerWaterFactor = attributes.workerWaterFactor || 1;
			this.workerArtisanFactor = attributes.workerArtisanFactor || 1;
			this.workerAcademicFactor = attributes.workerAcademicFactor || 1;
			this.workerHopeFactor = attributes.workerHopeFactor || 1;
		}
	});

	return LevelComponent;
});
