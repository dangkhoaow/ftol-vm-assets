define(['ash'], function (Ash) {
	
	let DialogueOptionVO = Ash.Class.extend({
	
        optionID: null,
        
        responsePageID: null,
		buttonTextKey: "",
		costs: {},
		isPreviewCosts: false,
		conditions: {},

		constructor: function (optionID) {
            this.optionID = optionID;
		},
		
	});

	return DialogueOptionVO;
});
