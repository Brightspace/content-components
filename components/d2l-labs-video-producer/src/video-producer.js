import '@brightspace-ui/core/components/button/button-icon.js';
import '@brightspace-ui/core/components/button/button.js';
import '@brightspace-ui/core/components/colors/colors.js';
import '@brightspace-ui-labs/media-player/media-player.js';
import './video-producer-chapters.js';

import { Container, Shape, Stage, Text } from '@createjs/easeljs';
import { css, html, LitElement } from 'lit-element/lit-element.js';
import constants from './constants.js';
import { InternalLocalizeMixin } from './internal-localize-mixin.js';
import { RtlMixin } from '@brightspace-ui/core/mixins/rtl-mixin.js';
import { selectStyles } from '@brightspace-ui/core/components/inputs/input-select-styles.js';

class VideoProducer extends RtlMixin(InternalLocalizeMixin(LitElement)) {
	static get properties() {
		return {
			defaultLanguage: { type: Object },
			metadata: { type: Object },
			selectedLanguage: { type: Object },
			src: { type: String, reflect: true },
			_loading: { type: Boolean, attribute: false },
			_videoLoaded: { type: Boolean, attribute: false },
		};
	}

	static get styles() {
		return [selectStyles, css`
			.d2l-video-producer {
				display: flex;
				flex-direction: column;
			}
			.d2l-video-producer-video-controls {
				display: flex;
				height: 580px;
				justify-content: space-between;
			}

			.d2l-video-producer d2l-labs-media-player {
				display: flex;
				margin-right: 20px;
				width: 100%;
			}

			.d2l-video-producer-timeline {
				margin-top: 15px;
			}

			.d2l-video-producer-timeline-controls {
				display: inline-flex;
				height: 90px;
				justify-content: center;
				vertical-align: top;
				width: 170px;
			}

			.d2l-video-producer-timeline-controls d2l-button-icon {
				margin: 0 4px;
			}

			#timeline-canvas {
				border: 1px solid #787878;
			}
		`];
	}

	constructor() {
		super();

		this._controlMode = constants.CONTROL_MODES.SEEK;
		this._shouldResumePlaying = false;
		this._cuts = {};
		this._updateTimelineInterval = null;
		this._mouseTime = null;
		this._mouseDownStageX = null;
		this._stage = null;

		this._draggingMark = false;
		this._marks = {};
		this._lowerMark = null;
		this._upperMark = null;
		this._currentMark = null;

		this._lowerBound = constants.TIMELINE_OFFSET_X;
		this._upperBound = constants.TIMELINE_WIDTH;

		this.metadata = { cuts: [], chapters: [] };
		this.src = '';
		this.selectedLanguage = {};
		this._videoLoaded = false;
	}

	firstUpdated() {
		super.firstUpdated();
		this._video = this.shadowRoot.querySelector('d2l-labs-media-player');
		this._chapters = this.shadowRoot.querySelector('d2l-labs-video-producer-chapters');
		this._configureStage();
		this._configureModes();

		this._chapters.addEventListener('active-chapter-updated',
			this._handleActiveChapterUpdated.bind(this));

		// Wait for video to be loaded
		this._video.addEventListener('loadeddata', () => {
			this._videoLoaded = true;
			this._changeToSeekMode();
			if (this.metadata) {
				this._addCutsToTimeline(this.metadata.cuts);
			}
		});
	}

	render() {
		return html`
			<div class="d2l-video-producer">
				<div class="d2l-video-producer-video-controls">
					<d2l-labs-media-player
						@pause="${this._pauseUpdatingVideoTime}"
						@play="${this._startUpdatingVideoTime}"
						@seeking="${this._updateVideoTime}"
						controls
						src="${this.src}"
					></d2l-labs-media-player>
					<d2l-labs-video-producer-chapters
						.chapters="${this.metadata && this.metadata.chapters}"
						.defaultLanguage="${this.defaultLanguage}"
						.selectedLanguage="${this.selectedLanguage}"
						?loading="${this._loading}"
						@add-new-chapter="${this._addNewChapter}"
						@chapters-changed="${this._handleChaptersChanged}"
						@set-chapter-to-current-time="${this._setChapterToCurrentTime}"
					></d2l-labs-video-producer-chapters>
				</div>
				<div class="d2l-video-producer-timeline">
					<canvas width="985" height="90" id="timeline-canvas"></canvas>
					<div class="d2l-video-producer-timeline-controls">
						<d2l-button-icon @click="${this._changeToSeekMode}" text="${this.localize(constants.CONTROL_MODES.SEEK)}" icon="tier1:divider-solid"></d2l-button-icon>
						<d2l-button-icon @click="${this._changeToMarkMode}" text="${this.localize(constants.CONTROL_MODES.MARK)}" icon="tier1:edit"></d2l-button-icon>
						<d2l-button-icon @click="${this._changeToCutMode}" text="${this.localize(constants.CONTROL_MODES.CUT)}" icon="html-editor:cut"></d2l-button-icon>
					</div>
				</div>
			</div>
		`;
	}

	updated(changedProperties) {
		super.updated(changedProperties);
		if (changedProperties.has('metadata') && this.metadata && this._videoLoaded) {
			this._addCutsToTimeline(this.metadata.cuts);
		}
	}

	_addCutsToTimeline(cuts) {
		const clearCuts = () => {
			Object.values(this._cuts).forEach(cut => {
				this._stage.removeChild(cut.displayObject);
			});
			this._cuts = {};
		};

		clearCuts();

		const addCut = (cut) => {
			// Don't add mark if cut starts at 0 seconds
			if (cut.in > 0) this._addMarkAtTime(cut.in);

			// Don't add mark if cut goes to the end of the video
			// NOTE: 0 value means cut goes to end of video.
			if (cut.out > 0 && cut.out <= Math.floor(this._video.duration)) {
				this._addMarkAtTime(cut.out);
			}

			this._setCutBoundsForStageX(this._getStageXFromTime(cut.in) + 1); // Trigger a cut just to the right of the lower mark
			this._cut();
		};

		cuts.forEach(cut => {
			addCut(cut);
		});

		if (this._currentMark) {
			this._setMarkStyleNormal(this._currentMark.displayObject);
			this._currentMark = null;
		}

		this._stage.update();
	}

	_addMarkAtTime(time) {
		const markX = this._getStageXFromTime(time) + constants.CURSOR_OFFSET_X;
		const bound = Math.round(markX);

		// Don't add a mark if one already exists here (e.g. cut from 0-1, cut from 1-2)
		if (!this._marks[bound]) {
			const mark = new Shape();
			mark.setTransform(markX, constants.CURSOR_OFFSET_Y);
			mark.graphics.beginFill('#797979').drawRect(0, 0, constants.MARK_WIDTH, constants.MARK_HEIGHT);

			const hitBox = new Shape();
			hitBox.graphics.beginFill('#FFF').drawRect(constants.HITBOX_OFFSET, constants.HITBOX_OFFSET, constants.HITBOX_WIDTH, constants.HITBOX_HEIGHT);
			mark.hitArea = hitBox;
			this._stage.addChild(mark);

			this._marks[bound] = {
				time: time,
				bound: bound,
				displayObject: mark
			};
		}

		if (this._currentMark) {
			this._setMarkStyleNormal(this._currentMark.displayObject);
		}

		this._currentMark = this._marks[bound];
		return this._currentMark;
	}

	//#region Chapter management
	_addNewChapter() {
		this._chapters.addNewChapter(this._video.currentTime);
	}

	_addOrDeleteMarkForEvent(event) {
		if (this._draggingMark) return;
		if (this._checkForMarkDelete(event)) return;
		const mark = this._addMarkAtTime(this._cursor.time);
		const cut = this._isTimeInCut(this._marks[mark.bound].time * 1000);
		if (cut) {
			this._stage.removeChild(cut.displayObject);
			delete this._cuts[cut.x];

			this._setCutBoundsForStageX(cut.displayObject.x + 1);
			const cuts = this._getCuts();
			cuts.forEach(c => {
				// Since the mark will shorten the length of the cut, find the cut with in ===
				// the lower cut bound, and update its out time
				if (c.in === (this._lowerMark ? this._lowerMark.time : 0)) {
					c.out = (this._upperMark ? this._upperMark.time : 0);
				}
			});
			this._fireMetadataChangedEvent({ cuts });
		}

		this._hideCursor();
		this._showAndMoveTimeContainer(mark.time);
		this._stage.update();
	}

	//#region Control mode management
	_changeToCutMode() {
		this._video.pause();
		this._setMouseEnabledForMarks({ enabled: false });
		this._setMouseEnabledForCuts({ enabled: true });
		this._contentMarker.mouseEnabled = false;
		this._controlMode = constants.CONTROL_MODES.CUT;
		this._hideCursor();
	}

	_changeToMarkMode() {
		this._video.pause();
		this._setMouseEnabledForMarks({ enabled: true });
		this._setMouseEnabledForCuts({ enabled: false });
		this._contentMarker.mouseEnabled = false;
		this._controlMode = constants.CONTROL_MODES.MARK;
		this._cutHighlight.visible = false;
		this._stage.update();
	}

	_changeToSeekMode() {
		this._setMouseEnabledForMarks({ enabled: false });
		this._setMouseEnabledForCuts({ enabled: false });
		this._contentMarker.mouseEnabled = true;
		this._controlMode = constants.CONTROL_MODES.SEEK;
		this._cutHighlight.visible = false;
		this._hideCursor();
	}

	//#endregion
	_checkForMarkDelete(event) {
		if (this._mouseDownStageX && Math.abs(this._mouseDownStageX - event.stageX) === 0) {
			const markToDelete = this._marks[Math.round(this._currentMark.displayObject.x)];
			this._stage.removeChild(markToDelete.displayObject);
			this._currentMark = null;

			delete this._marks[markToDelete.bound];
			this._recalculateCuts();
			this._setCursorOrCurrentMark(this._stage.mouseX);

			this._mouseDownStageX = null;
			return true;
		}

		this._mouseDownStageX = null;
		return false;
	}

	_configureModes() {
		const CurrentControlMode = () => {
			switch (this._controlMode) {
				case constants.CONTROL_MODES.SEEK:
					return this._getSeekModeHandlers();
				case constants.CONTROL_MODES.MARK:
					return this._getMarkModeHandlers();
				case constants.CONTROL_MODES.CUT:
					return this._getCutModeHandlers();
			}
		};

		this._timelineRect.on('pressmove', (event) => { CurrentControlMode().timelinePressMove.bind(this)(event); });
		this._timelineRect.on('pressup', (event) => { CurrentControlMode().timelinePressUp.bind(this)(event); });
		this._timelineRect.on('mousedown', (event) => { CurrentControlMode().timelineMouseDown.bind(this)(event); });
		this._timelineRect.on('click', (event) => { CurrentControlMode().timelineMouseUp.bind(this)(event); });
		this._stage.on('stagemousemove', (event) => { CurrentControlMode().stageMouseMove.bind(this)(event); });
	}

	//#region Timeline management
	_configureStage() {
		this._stage = new Stage(this.shadowRoot.querySelector('#timeline-canvas'));
		this._stage.enableMouseOver(30);

		this._timelineRect = new Shape();
		this._timelineRect.setTransform(constants.TIMELINE_OFFSET_X, constants.TIMELINE_OFFSET_Y);
		this._timelineRect.graphics.beginFill('#000000').drawRect(0, 0, constants.TIMELINE_WIDTH, constants.TIMELINE_HEIGHT);
		this._stage.addChild(this._timelineRect);

		this._playedRect = new Shape();
		this._playedRect.setTransform(10, constants.TIMELINE_OFFSET_Y);
		this._playedRect.mouseEnabled = false;
		this._stage.addChild(this._playedRect);

		this._cursorDisplayObj = new Shape();
		this._cursorDisplayObj.graphics.beginFill('#BCBCBC').drawRect(0, 0, constants.MARK_WIDTH, constants.MARK_HEIGHT);
		this._cursorDisplayObj.alpha = 0.7;
		this._cursorDisplayObj.visible = false;
		this._cursorDisplayObj.mouseEnabled = false;
		this._stage.addChild(this._cursorDisplayObj);

		this._cursor = {
			time: 0,
			displayObject: this._cursorDisplayObj
		};

		this._contentMarker = new Shape();
		this._contentMarker.graphics.beginFill('#0099CC').drawRect(0, 0, constants.MARK_WIDTH, constants.MARK_HEIGHT);
		this._contentMarker.visible = false;
		this._contentMarker.mouseEnabled = false;

		this._contentMarkerHitBox = new Shape();
		this._contentMarkerHitBox.graphics.beginFill('#FFF').drawRect(constants.HITBOX_OFFSET, constants.HITBOX_OFFSET, constants.HITBOX_WIDTH, constants.HITBOX_HEIGHT);
		this._contentMarker.hitArea = this._contentMarkerHitBox;

		this._contentMarker.on('pressmove', (event) => {
			if (this._isMouseOverTimeline(false)) {
				this._moveContentMarker(event);
			} else {
				this._timeContainer.visible = false;
				this._stage.update();
			}
		});
		this._stage.addChild(this._contentMarker);

		this._timeContainer = new Container();
		this._timeContainer.x = 10;
		this._timeContainer.y = constants.TIME_CONTAINER_OFFSET_Y;
		this._timeContainer.visible = false;
		this._stage.addChild(this._timeContainer);

		this._timeTextBorder = new Shape();
		this._timeTextBorder.graphics.setStrokeStyle(2).beginStroke('#787878').beginFill('white');
		this._timeTextBorder.graphics.drawRoundRect(0, 0, constants.TIME_TEXT_BORDER_WIDTH, constants.TIME_TEXT_BORDER_HEIGHT, 3);
		this._timeContainer.addChild(this._timeTextBorder);

		this._timeText = new Text('', '18px Lato', '#616769'); // --d2l-color-ferrite
		this._timeText.lineHeight = 28;
		this._timeText.textBaseLine = 'top';
		this._timeText.x = 10;
		this._timeText.y = 6;
		this._timeContainer.addChild(this._timeText);

		this._cutHighlight = new Shape();
		this._cutHighlight.alpha = 0.3;
		this._cutHighlight.visible = false;
		this._cutHighlight.mouseEnabled = false;
		this._stage.addChild(this._cutHighlight);

		this._stage.update();
	}

	_cut() {
		const cut = new Shape();
		cut.setTransform(this._lowerBound, constants.TIMELINE_OFFSET_Y);
		cut.graphics.beginFill('#FF0000').drawRect(0, 0, this._upperBound - this._lowerBound, constants.TIMELINE_HEIGHT);
		cut.alpha = 0.5;

		// When we're splitting a cut by adding a mark, disable mouse for the new cut
		if (this._controlMode !== constants.CONTROL_MODES.CUT) {
			cut.mouseEnabled = false;
		}

		cut.on('click', (event) => {
			if (this._controlMode === constants.CONTROL_MODES.MARK) {
				this._addOrDeleteMarkForEvent(event);
			} else if (this._controlMode === constants.CONTROL_MODES.CUT) {
				delete this._cuts[event.target.x];
				this._stage.removeChild(event.target);
				this._stage.update();
				this._fireMetadataChangedEvent();
			}
		});

		// Add the cut shape below the marks
		let numMarks = 0;
		Object.values(this._marks).forEach(() => {
			numMarks++;
		});

		const zIndexForCut = this._stage.numChildren - numMarks;
		this._stage.addChildAt(cut, zIndexForCut);
		this._stage.update();

		this._cuts[cut.x] = {
			startTimeMS: (this._lowerMark ? this._lowerMark.time * 1000 : 0),
			endTimeMS: (this._upperMark ? this._upperMark.time * 1000 : 0),     // NOTE: 0 value means cut goes to end of video.
			lowerBound: this._lowerBound,
			upperBound: this._upperBound,
			displayObject: cut
		};
	}

	//#endregion
	_fireMetadataChangedEvent({ cuts = this._getCuts(), chapters = this.metadata.chapters } = {}) {
		this.dispatchEvent(new CustomEvent(
			'metadata-changed',
			{
				composed: false,
				detail: { cuts, chapters }
			}
		));
	}

	_getCutModeHandlers() {
		const highlightCut = (event) => {
			this._setCutBoundsForStageX(event.stageX);

			this._cutHighlight.setTransform(this._lowerBound, constants.TIMELINE_OFFSET_Y);
			this._cutHighlight.graphics.clear().beginFill('#B8B8B8').drawRect(0, 0, this._upperBound - this._lowerBound, constants.TIMELINE_HEIGHT);
			this._cutHighlight.visible = true;
			this._stage.update();
		};

		const hideCut = () => {
			this._cutHighlight.visible = false;
			this._stage.update();
		};

		return {
			timelineMouseDown: () => {},
			timelineMouseUp: (event) => {
				this._setCutBoundsForStageX(event.stageX);
				const cuts = this._getCuts().concat({
					in: (this._lowerMark ? this._lowerMark.time : 0),
					out: (this._upperMark ? this._upperMark.time : 0),
				});
				this._fireMetadataChangedEvent({ cuts });
			},
			timelinePressMove: () => {},
			timelinePressUp: () => {},
			stageMouseMove: (event) => {
				if (this._isMouseOverTimeline(false)) {
					highlightCut(event);
				} else {
					hideCut();
					this._timeContainer.visible = false;
				}
			}
		};
	}

	_getCuts() {
		return Object.values(this._cuts).map(cut => ({
			in: cut.startTimeMS / 1000,
			out: cut.endTimeMS / 1000
		}));
	}

	_getMarkModeHandlers() {
		const moveCurrentMark = (event) => {
			if (!this._currentMark) return;
			this._draggingMark = true;

			const markToUpdate = this._currentMark;
			delete this._marks[Math.round(this._currentMark.displayObject.x)];

			// Clamp mark movement between surrounding marks, taking rounding into account
			let minTime = 0;
			let maxTime = Math.floor(this._video.duration);
			let minX = constants.TIMELINE_OFFSET_X;
			let maxX = constants.TIMELINE_OFFSET_X + constants.TIMELINE_WIDTH;

			Object.values(this._marks).forEach(mark => {
				if (mark.time < markToUpdate.time && mark.time >= minTime) {
					minTime = mark.time + 1;
					minX = mark.displayObject.x - constants.CURSOR_OFFSET_X + 15;
				} else if (mark.time > markToUpdate.time && mark.time <= maxTime) {
					maxTime = mark.time - 1;
					maxX = mark.displayObject.x - constants.CURSOR_OFFSET_X - 15;
				}
			});
			const roundedMinXTime = Math.ceil(this._getTimeFromStageX(minX));  // Rounding up to next second
			const roundedMaxXTime = Math.floor(this._getTimeFromStageX(maxX));  // Rounding down to prev second

			minTime = Math.max(minTime, roundedMinXTime);
			maxTime = Math.min(maxTime, roundedMaxXTime);

			const roundedEventTime = this._getRoundedTime(this._getTimeFromStageX(event.stageX));
			const clampedTime = Math.min(Math.max(roundedEventTime, minTime), maxTime);
			markToUpdate.time = clampedTime;
			markToUpdate.displayObject.setTransform(this._getStageXFromTime(clampedTime) + constants.CURSOR_OFFSET_X, constants.CURSOR_OFFSET_Y);
			markToUpdate.bound = Math.round(markToUpdate.displayObject.x);

			this._marks[markToUpdate.bound] = markToUpdate;

			this._recalculateCuts();
			this._showAndMoveTimeContainer(markToUpdate.time);

			this._stage.update();
		};

		return {
			timelineMouseDown: event => {
				if (this._currentMark) {
					this._mouseDownStageX = event.stageX;
				}
			},
			timelineMouseUp: event => { this._addOrDeleteMarkForEvent(event); },
			timelinePressMove: event => {
				if (this._isMouseOverTimeline(false)) {
					moveCurrentMark(event);
				} else {
					this._timeContainer.visible = false;
					this._stage.update();
				}
			},
			timelinePressUp: () => {
				// If mark was just removed (=== null), a cut may have changed
				if ((this._draggingMark || this._currentMark === null) && this._cutTimeChanged) {
					this._fireMetadataChangedEvent();
				}
				this._cutTimeChanged = false;
				this._draggingMark = false;
			},
			stageMouseMove: () => {
				if (this._isMouseOverTimeline(false)) {
					this._setCursorOrCurrentMark(this._stage.mouseX);
				} else {
					this._hideCursor();
					this._draggingMark = false;
				}
			}
		};
	}

	_getNewCutPositionForCut(cut) {
		let result = cut.lowerBound + 1;
		// We can use the lowerBound unless the lower mark changed
		if (cut.lowerBound !== constants.TIMELINE_OFFSET_X && !this._marks[cut.lowerBound + constants.CURSOR_OFFSET_X]) {
			result = constants.TIMELINE_OFFSET_X + 1;
			Object.values(this._marks).forEach(mark => {
				if (mark.bound < cut.upperBound + constants.CURSOR_OFFSET_X && mark.bound > result) {
					result = mark.bound - constants.CURSOR_OFFSET_X + 1;
				}
			});
		}
		return result;
	}

	_getRoundedPosition(stageXPosition) {
		const time = this._getTimeFromStageX(stageXPosition);
		const roundedTime = this._getRoundedTime(time);
		return this._getStageXFromTime(roundedTime);
	}

	_getRoundedTime(time) {
		return Math.min(Math.round(time), Math.floor(this._video.duration));
	}

	_getSeekModeHandlers() {
		const seek = event => {
			const clampZeroToOne = number => {
				return Math.min(Math.max(number, 0), 1);
			};

			if (this._video.duration > 0) {
				this._mouseTime = this._video.duration * clampZeroToOne(event.localX / constants.TIMELINE_WIDTH);
				this._video.currentTime = this._mouseTime;
				this._updateVideoTime();
			}
		};

		const seekMode = {
			timelineMouseUp: () => {},
			timelinePressMove: seek,
			timelinePressUp: () => {
				this._stage.mouseMoveOutside = false;

				if (this._shouldResumePlaying) {
					if (this._video.currentTime < this._video.duration) {
						this._video.play();
					}

					this._shouldResumePlaying = false;
				}
			},
			stageMouseMove: () => {
				if (this._isMouseOverContentMarker() && this._activeChapterTime) {
					this._showAndMoveTimeContainer(this._activeChapterTime);
				} else {
					this._timeContainer.visible = false;
					this._stage.update();
				}
			}
		};
		seekMode.timelineMouseDown = event => {
			this._stage.mouseMoveOutside = true;

			this._shouldResumePlaying = !this._video.paused && !this._video.ended;
			this._video.pause();

			seekMode.timelinePressMove(event);
		};

		return seekMode;
	}

	_getStageXFromTime(time) {
		return ((time / this._video.duration) * constants.TIMELINE_WIDTH) + constants.TIMELINE_OFFSET_X;
	}

	_getTimeFromStageX(stageX) {
		const clampedTimelineStageX = Math.min(
			Math.max(stageX, constants.TIMELINE_OFFSET_X),
			constants.TIMELINE_OFFSET_X + constants.TIMELINE_WIDTH
		);
		const seekPosition = (clampedTimelineStageX - constants.TIMELINE_OFFSET_X) / constants.TIMELINE_WIDTH * 100;
		const time = this._video.duration * (seekPosition / 100);

		return time;
	}

	_handleActiveChapterUpdated({ detail: { chapterTime } }) {
		if (chapterTime !== null) {
			this._activeChapterTime = chapterTime;
			this._contentMarker.visible = true;
			this._contentMarker.mouseEnabled = true;
			this._contentMarker.setTransform(this._getStageXFromTime(chapterTime) +
				constants.CURSOR_OFFSET_X, constants.CURSOR_OFFSET_Y);
		} else {
			this._contentMarker.visible = false;
			this._contentMarker.mouseEnabled = false;
			this._timeContainer.visible = false;
		}
		this._stage.update();
	}

	//#endregion
	_handleChaptersChanged(e) {
		this._fireMetadataChangedEvent({ chapters: e.detail.chapters });
	}

	_hideCursor() {
		this._cursor.displayObject.visible = false;
		this._timeContainer.visible = false;
		this._stage.update();
	}

	_isMouseOverContentMarker() {
		const underMouse = this._stage.getObjectsUnderPoint(this._stage.mouseX, this._stage.mouseY, 1)[0];
		return this._contentMarker === underMouse;
	}

	_isMouseOverMark() {
		const underMouse = this._stage.getObjectsUnderPoint(this._stage.mouseX, this._stage.mouseY, 1)[0];

		let result = false;
		Object.values(this._marks).forEach(mark => {
			if (mark.displayObject === underMouse) {
				result = mark;
			}
		});
		return result;
	}

	_isMouseOverTimeline(directlyOver) {
		const objects = this._stage.getObjectsUnderPoint(this._stage.mouseX, this._stage.mouseY, 1);

		if (directlyOver) {
			return objects[0] === this._timelineRect;
		} else {
			return objects.includes(this._timelineRect);
		}
	}

	_isTimeInCut(time) {
		let result = false;
		Object.values(this._cuts).forEach(cut => {
			if (cut.startTimeMS < time && (cut.endTimeMS > time || cut.endTimeMS === 0)) {
				result = cut;
			}
		});
		return result;
	}

	get _loading() {
		return !(
			this.metadata
			&& this._videoLoaded
			&& this.selectedLanguage
			&& this.selectedLanguage.code
		);
	}

	_moveContentMarker(event) {
		if (this._controlMode === constants.CONTROL_MODES.SEEK) {
			this._chapters.setChapterToTime(this._getTimeFromStageX(event.stageX));
			this._showAndMoveTimeContainer(this._activeChapterTime);
		}
	}

	//#region Video time management
	_pauseUpdatingVideoTime() {
		clearInterval(this._updateTimelineInterval);
	}

	_recalculateCuts() {
		Object.entries(this._cuts).forEach(([cut, value]) => {
			const cutPos = this._getNewCutPositionForCut(value);

			this._stage.removeChild(value.displayObject);
			delete this._cuts[cut];

			this._setCutBoundsForStageX(cutPos);

			// Don't add the cut if one already exists, e.g. removing a mark
			// that was separating two cuts
			if (!this._cuts[this._lowerBound]) {
				this._cut();
				const newCut = this._cuts[cut] || {};
				const cutTimeChanged = (value.startTimeMS !== newCut.startTimeMS)
					|| (value.endTimeMS !== newCut.endTimeMS);
				if (cutTimeChanged) {
					this._cutTimeChanged = true;
				}
			}
		});
	}

	//#endregion
	_setChapterToCurrentTime() {
		this._chapters.setChapterToTime(this._video.currentTime);
	}

	_setCursorOrCurrentMark(stageXPosition) {
		if (this._draggingMark) return;

		const roundedTime = this._getRoundedTime(this._getTimeFromStageX(stageXPosition));
		const roundedXPos = Math.round(this._getStageXFromTime(roundedTime));
		const xPosWithPadding = roundedXPos + constants.CURSOR_OFFSET_X;

		// Always start with no mark selected/no cursor shown
		this._cursor.displayObject.visible = false;
		this._timeContainer.visible = false;

		if (this._currentMark) {
			this._setMarkStyleNormal(this._currentMark.displayObject);
			this._currentMark = null;
		}

		const setMarkStyleHighlighted = (mark) => {
			mark.graphics.clear().beginFill('#797979').drawRect(0, 0, constants.MARK_WIDTH, constants.MARK_HEIGHT);
		};
		// Check for mousing over a mark first. This takes precidence over the timeline.
		const mouseOverMark = this._isMouseOverMark();
		if (mouseOverMark) {
			this._currentMark = mouseOverMark;
			setMarkStyleHighlighted(mouseOverMark.displayObject);
			this._showAndMoveTimeContainer(mouseOverMark.time);
		} else if (this._isMouseOverTimeline(false)) {
			if (this._marks[xPosWithPadding]) {
				this._currentMark = this._marks[xPosWithPadding];
				setMarkStyleHighlighted(this._currentMark.displayObject);
				this._showAndMoveTimeContainer(this._currentMark.time);
			} else {
				this._cursor.time = roundedTime;
				this._cursor.displayObject.visible = true;
				this._cursor.displayObject.setTransform(this._getRoundedPosition(stageXPosition) + constants.CURSOR_OFFSET_X, constants.CURSOR_OFFSET_Y);
				this._showAndMoveTimeContainer(this._cursor.time);
			}
		}

		this._stage.update();
	}

	_setCutBoundsForStageX(stageX) {
		this._lowerBound = constants.TIMELINE_OFFSET_X;
		this._upperBound = constants.TIMELINE_WIDTH + constants.TIMELINE_OFFSET_X;
		this._lowerMark = null;
		this._upperMark = null;

		Object.values(this._marks).forEach(mark => {
			const markPos = mark.bound - constants.CURSOR_OFFSET_X;

			if (markPos < stageX && markPos > this._lowerBound) {
				this._lowerBound = markPos;
				this._lowerMark = mark;
			} else if (markPos > stageX && markPos < this._upperBound) {
				this._upperBound = markPos;
				this._upperMark = mark;
			}
		});
	}

	_setMarkStyleNormal(mark) {
		mark.graphics.clear().beginFill('#BCBCBC').drawRect(0, 0, constants.MARK_WIDTH, constants.MARK_HEIGHT);
	}

	_setMouseEnabledForCuts({ enabled }) {
		Object.values(this._cuts).forEach(cut => {
			cut.displayObject.mouseEnabled = enabled;
		});
	}

	_setMouseEnabledForMarks({ enabled }) {
		Object.values(this._marks).forEach(mark => {
			mark.displayObject.mouseEnabled = enabled;
		});
	}

	_showAndMoveTimeContainer(time) {
		if (time) {
			this._timeText.text = new Date(time * 1000).toISOString().substr(11, 8);
			this._timeContainer.visible = true;

			const stageX = this._getStageXFromTime(time);
			this._timeContainer.x = Math.min(
				Math.max(stageX + constants.TIME_CONTAINER_OFFSET_X, constants.TIMELINE_OFFSET_X),
				constants.TIMELINE_OFFSET_X + constants.TIMELINE_WIDTH - constants.TIME_TEXT_BORDER_WIDTH
			);
			this._stage.update();
		}
	}

	_startUpdatingVideoTime() {
		// Restart video if paused at end cut.
		Object.values(this._cuts).reverse().forEach(cut => {
			if (cut.endTimeMS === 0 && this._video.currentTime === cut.startTimeMS / 1000) {
				this._video.currentTime = 0;
			}

			// Only interested in the last cut, break the loop.
			return false;
		});

		this._updateTimelineInterval = setInterval(() => {
			// Skip cuts
			const cut = this._isTimeInCut(this._video.currentTime * 1000);
			if (cut) {
				if (cut.endTimeMS === 0) {
					this._video.currentTime = cut.startTimeMS / 1000;
					this._video.pause();
				} else {
					this._video.currentTime = cut.endTimeMS / 1000;
				}
			}

			this._updateVideoTime();
		}, 50);
	}

	_updateVideoTime() {
		// Clear the seeked time once the video has caught up
		if (this._mouseTime && Math.abs(this._mouseTime - this._video.currentTime) < 1) {
			this._mouseTime = null;
		}
		const width = Math.min(constants.TIMELINE_WIDTH, constants.TIMELINE_WIDTH * ((this._mouseTime || this._video.currentTime) / this._video.duration));
		this._playedRect.graphics.clear().beginFill('#0066CC').drawRect(0, 0, width, constants.TIMELINE_HEIGHT);
		this._stage.update();
	}
}
customElements.define('d2l-labs-video-producer', VideoProducer);
