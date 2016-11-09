/// <reference path="Button.ts"/>
/// <reference path="ControlElement.ts"/>
/// <reference path="RadioButton.ts"/>
/// <reference path="CheckboxButton.ts"/>
/// <reference path="OptionsList.ts"/>
/// <reference path="UploadFileUI.ts"/>
/// <reference path="../ScrollController.ts"/>
/// <reference path="../chat/ChatResponse.ts"/>
/// <reference path="../../../typings/es6-promise/es6-promise.d.ts"/>

// namespace
namespace cf {
	export interface ControlElementsDTO{
		height: number;
	}

	export interface IControlElementsOptions{
		el: HTMLElement;
	}

	export class ControlElements {
		private elements: Array<IControlElement | OptionsList>;
		private el: HTMLElement;
		private list: HTMLElement;
		private infoElement: HTMLElement;

		private ignoreKeyboardInput: boolean = false;
		private rowIndex: number = -1;
		private columnIndex: number = 0;
		private tableableRows: Array<Array<IControlElement>>;

		private userInputUpdateCallback: () => void;
		private onChatAIReponseCallback: () => void;
		private onUserInputKeyChangeCallback: () => void;
		private onElementFocusCallback: () => void;
		private onScrollCallback: () => void;

		private elementWidth: number = 0;
		private filterListNumberOfVisible: number = 0;
		private listScrollController: ScrollController;

		private rAF: number;
		private listWidth: number = 0;

		public get active():boolean{
			return this.elements && this.elements.length > 0;
		}

		public get focus():boolean{
			const elements: Array<IControlElement> = this.getElements();
			for (var i = 0; i < elements.length; i++) {
				let element: ControlElement = <ControlElement>elements[i];
				if(element.focus){
					return true;
				}
			}

			return false;
		}

		public get length(): number{
			const elements: Array<IControlElement> = this.getElements();
			return elements.length;
		}

		constructor(options: IControlElementsOptions){
			this.el = options.el;
			this.list = <HTMLElement> this.el.getElementsByTagName("cf-list")[0];
			this.infoElement = <HTMLElement> this.el.getElementsByTagName("cf-info")[0];

			this.onScrollCallback = this.onScroll.bind(this);
			this.el.addEventListener('scroll', this.onScrollCallback, false);

			this.onElementFocusCallback = this.onElementFocus.bind(this);
			document.addEventListener(ControlElementEvents.ON_FOCUS, this.onElementFocusCallback, false);

			this.onChatAIReponseCallback = this.onChatAIReponse.bind(this);
			document.addEventListener(ChatResponseEvents.AI_QUESTION_ASKED, this.onChatAIReponseCallback, false);

			this.onUserInputKeyChangeCallback = this.onUserInputKeyChange.bind(this);
			document.addEventListener(UserInputEvents.KEY_CHANGE, this.onUserInputKeyChangeCallback, false);

			// user input update
			this.userInputUpdateCallback = this.onUserInputUpdate.bind(this);
			document.addEventListener(FlowEvents.USER_INPUT_UPDATE, this.userInputUpdateCallback, false);

			this.listScrollController = new ScrollController({
				interactionListener: this.el,
				listToScroll: this.list,
				listNavButtons: this.el.getElementsByTagName("cf-list-button"),
			});
		}

		private onScroll(event: Event){
			// some times the tabbing will result in el scroll, reset this.
			this.el.scrollLeft = 0;
		}

		private onElementFocus(event: CustomEvent){
			const vector: ControlElementVector = <ControlElementVector> event.detail;
			const x: number = (vector.x != 0 ? vector.x - vector.width : 0) * -1;
			
			// this.currentFocusIndex = 0;
			this.listScrollController.setScroll(x, 0);
		}

		private onChatAIReponse(event:CustomEvent){
			this.animateElementsIn();
		}

		private onUserInputKeyChange(event: CustomEvent){
			if(this.ignoreKeyboardInput){
				this.ignoreKeyboardInput = false;
				return;
			}

			const dto: InputKeyChangeDTO = event.detail;
			const userInput: UserInput = dto.dto.input;

			if(this.active){
				let shouldFilter: boolean = dto.inputFieldActive;
				if(shouldFilter){
					// input field is active, so we should filter..
					const dto: FlowDTO = (<InputKeyChangeDTO> event.detail).dto;
					const inputValue: string = dto.input.getInputValue();
					this.filterElementsFrom(inputValue);
				}else{
					if(dto.keyCode == 37){
						this.columnIndex--;
						// key LEFT
					}else if(dto.keyCode == 39){
						this.columnIndex++;
						// key RIGHT
					}else if(dto.keyCode == 40){
						// key DOWN
						this.rowIndex++;
						this.onRowIndexChange();
					}else if(dto.keyCode == 38){
						// key UP
						this.rowIndex--;
						this.onRowIndexChange();
					}

					if(this.validateRowColIndexes()){
						userInput.setFocusOnInput();
					}
				}
			}

			console.log("keyboard touched...", "rowindex:", this.rowIndex);
			if(!userInput.active && this.tableableRows && (this.rowIndex == 0 || this.rowIndex == 1)){
				this.tableableRows[this.rowIndex][this.columnIndex].el.focus();
			}
		}

		private validateRowColIndexes():boolean{
			const maxRowIndex: number = (this.el.classList.contains("two-row") ? 1 : 0)
			console.log('validateRowColIndexes:', "this.rowIndex:", this.rowIndex);
			if(this.rowIndex >= 0 && this.rowIndex <= maxRowIndex){
				// columnIndex is only valid if rowIndex is valid
				if(this.columnIndex < 0){
					this.columnIndex = this.tableableRows[this.rowIndex].length - 1;
					return false;
				}

				if(this.columnIndex > this.tableableRows[this.rowIndex].length - 1){
					this.columnIndex = 0;
					return false;
				}
			}

			console.log('validateRowColIndexes:', this.rowIndex, this.columnIndex);

			if(this.rowIndex < 0 || this.rowIndex > maxRowIndex){
				this.resetTabList();
				return true;
			}

			return false;
		}

		private onRowIndexChange(){
			// TODO: find nearest columnIndex to the current one.
			// this.columnIndex = 0;
		}

		private resetTabList(){
			this.rowIndex = -1;
			this.columnIndex = -1;
		}

		private onUserInputUpdate(event: CustomEvent){
			this.el.classList.remove("animate-in");
			this.infoElement.classList.remove("show");

			if(this.elements){
				const elements: Array<IControlElement> = this.getElements();
				for (var i = 0; i < elements.length; i++) {
					let element: ControlElement = <ControlElement>elements[i];
					element.animateOut();
				}
			}
		}

		private filterElementsFrom(value:string){
			const inputValuesLowerCase: Array<string> = value.toLowerCase().split(" ");
			if(inputValuesLowerCase.indexOf("") != -1)
				inputValuesLowerCase.splice(inputValuesLowerCase.indexOf(""), 1);

			const elements: Array<IControlElement> = this.getElements();
			if(elements.length > 1){
				// the type is not strong with this one..
				let itemsVisible: Array<ControlElement> = [];
				for (let i = 0; i < elements.length; i++) {
					let element: ControlElement = <ControlElement>elements[i];
					let elementVisibility: boolean = true;
					
					// check for all words of input
					for (let i = 0; i < inputValuesLowerCase.length; i++) {
						let inputWord: string = <string>inputValuesLowerCase[i];
						if(elementVisibility){
							elementVisibility = element.value.toLowerCase().indexOf(inputWord) != -1;
						}
					}

					// set element visibility.
					element.visible = elementVisibility;
					if(elementVisibility && element.visible) 
						itemsVisible.push(element);
				}

				// set feedback text for filter..
				this.infoElement.innerHTML = itemsVisible.length == 0 ? Dictionary.get("input-no-filter").split("{input-value}").join(value) : "";
				if(itemsVisible.length == 0){
					this.infoElement.classList.add("show");
				}else{
					this.infoElement.classList.remove("show");
				}

				// crude way of checking if list has changed...
				const hasListChanged: boolean = this.filterListNumberOfVisible != itemsVisible.length;
				if(hasListChanged){
					this.resize();
					this.animateElementsIn();
				}
				
				this.filterListNumberOfVisible = itemsVisible.length;
			}
		}

		private animateElementsIn(){
			const elements: Array<IControlElement> = this.getElements();
			if(elements.length > 0){
				if(!this.el.classList.contains("animate-in"))
					this.el.classList.add("animate-in");
				
				for (let i = 0; i < elements.length; i++) {
					let element: ControlElement = <ControlElement>elements[i];
					element.animateIn();
				}
			}
		}

		private getElements(): Array <IControlElement> {
			if(this.elements.length > 0 && this.elements[0].type == "OptionsList")
				return (<OptionsList> this.elements[0]).elements;
			
			return <Array<IControlElement>> this.elements;
		}

		/**
		* @name buildTabableRows
		* build the tabable array index
		*/
		private buildTabableRows(): void {
			console.log("buildTabableRows");
			this.tableableRows = [];
			this.resetTabList();

			const elements: Array<IControlElement> = this.getElements();

			if(this.el.classList.contains("two-row")){
				// two rows
				this.tableableRows[0] = [];
				this.tableableRows[1] = [];

				for (let i = 0; i < elements.length; i++) {
					let element: IControlElement = <IControlElement>elements[i];
					if(element.visible){
						if(element.positionVector.y == 0)
							this.tableableRows[0].push(element);
						else
							this.tableableRows[1].push(element);
					}
				}
			}else{
				// single row
				this.tableableRows[0] = [];

				for (let i = 0; i < elements.length; i++) {
					let element: IControlElement = <IControlElement>elements[i];
					if(element.visible)
						this.tableableRows[0].push(element);
				}
			}

			console.log("this.tableableRows created:", this.tableableRows)
		}
		
		public focusFrom(angle: string){
			console.log("focus from: this.tableableRows valid?", this.tableableRows);
			if(!this.tableableRows)
				return;

			this.columnIndex = 0;
			if(angle == "bottom"){
				this.rowIndex = this.el.classList.contains("two-row") ? 1 : 0;
			}else if(angle == "top"){
				this.rowIndex = 0;
			}


			if(this.tableableRows[this.rowIndex] && this.tableableRows[this.rowIndex][this.columnIndex]){
				this.ignoreKeyboardInput = true;
				this.tableableRows[this.rowIndex][this.columnIndex].el.focus();
			}else{
				this.resetTabList();
			}

			console.log("focusFrom", angle, "this.rowIndex:", this.rowIndex);
		}
		public setFocusOnElement(index: number){
			const elements: Array<IControlElement> = this.getElements();
			if(this.tableableRows && index != -1){
				this.tableableRows[0][0].el.focus();
			}else{
				this.rowIndex = 0;
			}
		}

		public updateStateOnElements(controlElement: IControlElement){
			this.list.classList.add("disabled");
			if(controlElement.type == "RadioButton"){
				// uncheck other radio buttons...
				const elements: Array<IControlElement> = this.getElements();
				for (let i = 0; i < elements.length; i++) {
					let element: RadioButton = <RadioButton>elements[i];
					if(element != controlElement){
						element.checked = false;
					}
				}
			}
		}

		public reset(){
			this.el.classList.remove("one-row");
			this.el.classList.remove("two-row");
		}

		public getElement(index: number):IControlElement | OptionsList{
			return this.elements[index];
		}

		public getDTO(): FlowDTO{
			let dto: FlowDTO = {
				text: undefined,
				controlElements: [],
			}

			// generate text value for ChatReponse

			if(this.elements && this.elements.length > 0){
				switch(this.elements[0].type){
					case "CheckboxButton" :
						var values: Array<string> = [];
						for (var i = 0; i < this.elements.length; i++) {
							let element: CheckboxButton = <CheckboxButton> this.elements[i];
							if(element.checked){
								values.push(element.value);
							}

							dto.controlElements.push(element);
						}
						
						dto.text = Dictionary.parseAndGetMultiValueString(values);
						
						break;

					case "RadioButton" :
						for (var i = 0; i < this.elements.length; i++) {
							let element: RadioButton = <RadioButton> this.elements[i];

							if(element.checked){
								dto.text = element.value;
							}

							dto.controlElements.push(element);
						}
						break;
					case "OptionsList":
						var element: OptionsList = <OptionsList> this.elements[0];
						dto.controlElements = element.getValue();

						var values: Array<string> = [];
						if(dto.controlElements && dto.controlElements[0]){
							for (let i = 0; i < dto.controlElements.length; i++) {
								let element: IControlElement = <IControlElement>dto.controlElements[i];
								values.push(dto.controlElements[i].value);
							}
						}

						// after value is created then set to all elements
						dto.controlElements = element.elements;

						dto.text = Dictionary.parseAndGetMultiValueString(values);

						break;
					
					case "UploadFileUI":
						dto.text = (<UploadFileUI> this.elements[0]).value;//Dictionary.parseAndGetMultiValueString(values);
						dto.controlElements.push(<UploadFileUI> this.elements[0]);
						break;
				}
			}

			return dto;
		}

		public buildTags(tags: Array<ITag>){
			this.list.classList.remove("disabled");

			const topList: HTMLUListElement = (<HTMLUListElement > this.el.parentNode).getElementsByTagName("ul")[0];
			const bottomList: HTMLUListElement = (<HTMLUListElement> this.el.parentNode).getElementsByTagName("ul")[1];

			// remove old elements
			if(this.elements ){
				while(this.elements.length > 0){
					this.elements.pop().dealloc();
				}
			}

			this.elements = [];

			for (var i = 0; i < tags.length; i++) {
				var tag: ITag = tags[i];
				
				switch(tag.type){
					case "radio" :
						this.elements.push(new RadioButton({
							referenceTag: tag
						}));
						break;
					case "checkbox" :
						this.elements.push(new CheckboxButton({
							referenceTag: tag
						}));
					
						break;
					case "select" :
						this.elements.push(new OptionsList({
							referenceTag: tag,
							context: this.list,
						}));
						break;
					
					case "input" :
					default :
						if(tag.type == "file"){
							this.elements.push(new UploadFileUI({
								referenceTag: tag,
							}));
						}
						// nothing to add.
						console.log("UserInput buildControlElements:", "none Control UI type, only input field is needed.");
						break;
				}

				if(tag.type != "select" && this.elements.length > 0){
					const element: IControlElement = <IControlElement> this.elements[this.elements.length - 1];
					this.list.appendChild(element.el);
				}
			}

			const isElementsOptionsList: boolean = this.elements[0] && this.elements[0].type == "OptionsList";
			if(isElementsOptionsList){
				this.filterListNumberOfVisible = (<OptionsList> this.elements[0]).elements.length;
			}else{
				this.filterListNumberOfVisible = tags.length;
			}

			new Promise((resolve: any, reject: any) => this.resize(resolve, reject)).then(() => {
				const h: number = this.el.classList.contains("one-row") ? 52 : this.el.classList.contains("two-row") ? 102 : 0;

				const controlElementsAddedDTO: ControlElementsDTO = {
					height: h,
				};

				ConversationalForm.illustrateFlow(this, "dispatch", UserInputEvents.CONTROL_ELEMENTS_ADDED, controlElementsAddedDTO);
				document.dispatchEvent(new CustomEvent(UserInputEvents.CONTROL_ELEMENTS_ADDED, {
					detail: controlElementsAddedDTO
				}));
			});
		}

		public resize(resolve?: any, reject?: any){
			// scrollbar things
			// Element.offsetWidth - Element.clientWidth
			this.list.style.width = "100%";
			this.el.classList.remove("one-row");
			this.el.classList.remove("two-row");
			this.elementWidth = 0;

			setTimeout(() => {
				this.listWidth = 0;
				const elements: Array <IControlElement> = this.getElements();
				if(elements.length > 0){

					for (let i = 0; i < elements.length; i++) {
						let element: IControlElement = <IControlElement>elements[i];
						this.listWidth += element.positionVector.width;
					}

					const elOffsetWidth: number = this.el.offsetWidth;
					let isListWidthOverElementWidth: boolean = this.listWidth > elOffsetWidth;
					if(isListWidthOverElementWidth){
						this.el.classList.add("two-row");
						this.listWidth = Math.max(elOffsetWidth, Math.round((this.listWidth / 2) + 50));
						this.list.style.width = this.listWidth + "px";
					}else{
						this.el.classList.add("one-row");
					}

					// check again after classes are set.
					isListWidthOverElementWidth = this.listWidth > elOffsetWidth;

					// sort the list so we can set tabIndex properly
					const tabIndexFilteredElements: Array<IControlElement> = elements.sort((a: IControlElement, b: IControlElement) => {
						return a.positionVector.x == b.positionVector.x ? 0 : a.positionVector.x < b.positionVector.x ? -1 : 1;
					});

					for (let i = 0; i < tabIndexFilteredElements.length; i++) {
						let element: IControlElement = <IControlElement>tabIndexFilteredElements[i];
						//tabindex 1 are the UserInput element
						element.tabIndex = 2 + i;
					}
					
					// toggle nav button visiblity
					cancelAnimationFrame(this.rAF);
					if(isListWidthOverElementWidth){
						this.el.classList.remove("hide-nav-buttons");
					}else{
						this.el.classList.add("hide-nav-buttons");
					}

					this.elementWidth = elOffsetWidth;

					// resize scroll
					this.listScrollController.resize(this.listWidth, this.elementWidth);
				}

				this.buildTabableRows();

				if(resolve)
					resolve();
			}, 0);
		}

		public dealloc(){
			cancelAnimationFrame(this.rAF);
			this.rAF = null;

			this.el.removeEventListener('scroll', this.onScrollCallback, false);
			this.onScrollCallback = null;

			document.removeEventListener(ControlElementEvents.ON_FOCUS, this.onElementFocusCallback, false);
			this.onElementFocusCallback = null;

			document.removeEventListener(ChatResponseEvents.AI_QUESTION_ASKED, this.onChatAIReponseCallback, false);
			this.onChatAIReponseCallback = null;

			document.removeEventListener(UserInputEvents.KEY_CHANGE, this.onUserInputKeyChangeCallback, false);
			this.onUserInputKeyChangeCallback = null;

			this.listScrollController.dealloc();
		}
	}
}