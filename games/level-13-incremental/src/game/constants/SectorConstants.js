define(['ash', 'game/constants/LevelConstants'], function (Ash, LevelConstants) {
	
	let SectorConstants = {
		
		MAP_SECTOR_STATUS_UNVISITED_INVISIBLE: "unvisited-invisible",
		MAP_SECTOR_STATUS_UNVISITED_VISIBLE: "unvisited-seen",
		MAP_SECTOR_STATUS_VISITED_UNSCOUTED: "visited",
		MAP_SECTOR_STATUS_REVEALED_BY_MAP: "revealed-by-map",
		MAP_SECTOR_STATUS_VISITED_SCOUTED: "scouted",
		MAP_SECTOR_STATUS_VISITED_CLEARED: "cleared",
		
		SECTOR_TYPE_RESIDENTIAL: "residential",
		SECTOR_TYPE_INDUSTRIAL: "industrial",
		SECTOR_TYPE_MAINTENANCE: "maintenance",
		SECTOR_TYPE_COMMERCIAL: "commercial",
		SECTOR_TYPE_PUBLIC: "public",
		SECTOR_TYPE_EMPTY: "empty",
		SECTOR_TYPE_SLUM: "slum", // unused

		SECTOR_AFFILIATION_AGRICORP: "agricorp",
		SECTOR_AFFILIATION_MINECORP: "minecorp",
		SECTOR_AFFILIATION_HANSA: "hansa",
		SECTOR_AFFILIATION_DONBALISM: "donbalism",
		
		SECTOR_CONDITION_MAINTAINED: "maintained", // currently maintained
		SECTOR_CONDITION_RECENT: "recent", // well-kept pre-Fall
		SECTOR_CONDITION_WORN: "worn", // already in bad shape around the Fall
		SECTOR_CONDITION_ABANDONED: "abandoned", // already abandoned pre-Fall
		SECTOR_CONDITION_DAMAGED: "damaged", // not worn out but actually damaged by something
		SECTOR_CONDITION_RUINED: "ruined", // so damaged or worn it's hard to say which

		STYLE_CITTADINIAN: "cittadinian",
		STYLE_HUMANIST: "humanist",
		STYLE_INDUSTRIAL: "industrial",
		STYLE_KARBOQUE: "karboque",
		STYLE_KIEVAN: "kievan",
		STYLE_MODERN: "modern",
		STYLE_NEOWESTERN: "neo-western",
		STYLE_SLUM_GENERAL: "slum-general",
		STYLE_SLUM_HUN: "slum-hun",	
		STYLE_WESTERN: "western",

		SUNLIT_REASON_SURFACE: "surface",
		SUNLIT_REASON_MIRROR: "mirror",
		SUNLIT_REASON_HOLE: "hole",
		SUNLIT_REASON_NEIGHBOUR: "neighbour",
		
		WAYMARK_TYPE_CAMP: "camp",
		WAYMARK_TYPE_CLINIC: "clinic",
		WAYMARK_TYPE_DISTRICT: "district",
		WAYMARK_TYPE_PASSAGE: "camp",
		WAYMARK_TYPE_POLLUTION: "pollution",
		WAYMARK_TYPE_RADIATION: "radiation",
		WAYMARK_TYPE_SETTLEMENT: "settlement",
		WAYMARK_TYPE_SPRING: "spring",
		
		HAZARD_TYPE_RADIATION: "radiation",
		HAZARD_TYPE_POLLUTION: "poison",
		HAZARD_TYPE_DEBRIS: "debris",
		HAZARD_TYPE_FLOODED: "flooded",
		HAZARD_TYPE_GANG_TERRITORY: "territory",
		HAZARD_TYPE_COLD: "cold",
		
		isVisited: function (sectorStatus) {
			switch (sectorStatus) {
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_UNSCOUTED: return true;
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_SCOUTED: return true;
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_CLEARED: return true;
				default: return false;
			}
		},
		
		isLBasicInfoVisible: function (sectorStatus) {
			switch (sectorStatus) {
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_UNSCOUTED: return true;
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_SCOUTED: return true;
				case SectorConstants.MAP_SECTOR_STATUS_VISITED_CLEARED: return true;
				case SectorConstants.MAP_SECTOR_STATUS_REVEALED_BY_MAP: return true;
				default: return false;
			}
		},

		getCondition: function (wear, damage) {
			if (damage > 7 || wear > 9)
				return SectorConstants.SECTOR_CONDITION_RUINED;
			if (damage > 0)
				return SectorConstants.SECTOR_CONDITION_DAMAGED;
			if (wear > 7)
				return SectorConstants.SECTOR_CONDITION_ABANDONED;
			if (wear > 4)
				return SectorConstants.SECTOR_CONDITION_WORN;
			if (wear > 1)
				return SectorConstants.SECTOR_CONDITION_RECENT;
			
			return SectorConstants.SECTOR_CONDITION_MAINTAINED;
		},

		getSectorEnvironmentTags: function (worldData, levelData, districtData, sectorData, hasWater) {
			worldData = worldData || {};
			levelData = levelData || {};
			districtData = districtData || {};
			sectorData = sectorData || {};

			let tags = [];

			let level = levelData.level || levelData.position || sectorData.level || 0;
			let condition = this.getCondition(sectorData.wear, sectorData.damage);

			let sectorTypeMatches = (type) => sectorData.sectorType == type || districtData.type == type;

			let isPollutedLevel = levelData.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_POLLUTION;
			let isRadiatedLevel = levelData.notCampableReason === LevelConstants.UNCAMPABLE_LEVEL_TYPE_RADIATION;

			if (level == worldData.bottomLevel) tags.push("ground");
			if (level == worldData.topLevel) tags.push("surface");

			if (level < 14) tags.push("lowlevels");
			if (level > 14) tags.push("highlevels");

			if (!isPollutedLevel && !isRadiatedLevel && !sectorData.hazards.hasHazards()) tags.push("nohazard");
			if (sectorData.hazards.cold > 0) tags.push("cold");
			if (isPollutedLevel || sectorData.hazards.poison > 0) tags.push("toxic");
			if (isRadiatedLevel || sectorData.hazards.radiation > 0) tags.push("radiation");

			if (sectorData.sunlit) tags.push("sunlit");
			if (!sectorData.sunlit) tags.push("dark");

			if (sectorData.buildingDensity > 5) tags.push("dense");
			if (sectorData.buildingDensity < 5) tags.push("sparse");
			if (sectorData.activity < 4) tags.push("quiet");
			if (sectorData.activity > 6) tags.push("busy");

			if (Math.max(sectorData.wealth, districtData.wealth || 0) >= 8) tags.push("rich");
			if (Math.max(sectorData.wealth, districtData.wealth || 0) >= 4) tags.push("nopoor");
			if (Math.min(sectorData.wealth, districtData.wealth || 10) <= 6) tags.push("norich");
			if (Math.min(sectorData.wealth, districtData.wealth || 10) <= 3) tags.push("poor");

			if (levelData.habitability > 0) tags.push("inhabited");
			if (levelData.habitability <= 0) tags.push("uninhabited");

			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_MAINTENANCE)) tags.push("uninhabited");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_EMPTY)) tags.push("uninhabited");

			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_RESIDENTIAL)) tags.push("residential");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_INDUSTRIAL)) tags.push("industrial");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_MAINTENANCE)) tags.push("maintenance");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_COMMERCIAL)) tags.push("commercial");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_PUBLIC)) tags.push("public");
			if (sectorTypeMatches(SectorConstants.SECTOR_TYPE_EMPTY)) tags.push("empty");

			if (sectorData.hazards.flooded > 0) tags.push("flooded");
			if (sectorData.hazards.territory > 0) tags.push("territory");
			if (levelData.raidDangerFactor > 1) tags.push("raid");
			if (sectorData.hazards.flooded === 0) tags.push("noflood");

			if (sectorData.wear > 5 || districtData.wear > 5) tags.push("worn");
			if (sectorData.wear < 5 || districtData.wear < 5) tags.push("new");
			if (sectorData.damage > 0 || districtData.damage > 0) tags.push("damaged");

			if (sectorData.wear > 5 || sectorData.wear > 5 || sectorTypeMatches(SectorConstants.SECTOR_TYPE_PUBLIC) || sectorTypeMatches(SectorConstants.SECTOR_TYPE_RESIDENTIAL) || sectorData.sunlit) 
				tags.push("nature");

			if (!isPollutedLevel && !isRadiatedLevel && hasWater) tags.push("water");

			if (condition == SectorConstants.SECTOR_CONDITION_RUINED) tags.push("ruined");
			if (condition == SectorConstants.SECTOR_CONDITION_DAMAGED) tags.push("damaged");
			if (condition == SectorConstants.SECTOR_CONDITION_ABANDONED) tags.push("abandoned");
			if (condition == SectorConstants.SECTOR_CONDITION_WORN) tags.push("worn");
			if (condition == SectorConstants.SECTOR_CONDITION_RECENT) tags.push("recent");
			if (condition == SectorConstants.SECTOR_CONDITION_MAINTAINED) tags.push("maintained");

			return tags;
		},
		
	};
	
	return SectorConstants;
});
