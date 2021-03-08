import '@brightspace-ui/core/components/button/button-icon.js';
import '@brightspace-ui/core/components/colors/colors.js';
import '@brightspace-ui/core/components/inputs/input-text.js';
import '@brightspace-ui/core/components/loading-spinner/loading-spinner.js';
import { bodySmallStyles, bodyStandardStyles, heading3Styles } from '@brightspace-ui/core/components/typography/styles.js';
import { css, html, LitElement } from 'lit-element/lit-element.js';
import { InternalLocalizeMixin } from './internal-localize-mixin.js';

class VideoProducerChapters extends InternalLocalizeMixin(LitElement) {
	static get properties() {
		return {
			chapters: { type: Object },
			defaultLanguage: { type: Object },
			loading: { type: Boolean },
			selectedLanguage: { type: Object },
			_activeChapterIndex: { type: Number, attribute: false },
			_newChapterTitle: { type: String, attribute: false },
		};
	}

	static get styles() {
		return [  bodySmallStyles, bodyStandardStyles, heading3Styles, css`
			d2l-loading-spinner {
				margin: auto;
			}

			.d2l-video-producer-chapters {
				border: 1px solid var(--d2l-color-mica);
				box-sizing: border-box;
				height: 580px;
				position: relative;
				width: 360px;
			}

			.d2l-video-producer-chapters-heading {
				margin: 0;
				padding: 10px 10px 0;
			}

			.d2l-video-producer-chapters-heading .d2l-body-small.hidden {
				visibility: hidden;
			}

			.d2l-video-producer-chapters-container {
				display: flex;
				flex-direction: column;
				height: 440px;
				overflow-y: scroll;
				padding: 10px;
				position: relative;
			}

			.d2l-video-producer-chapter {
				display: flex;
			}

			.d2l-video-producer-chapter-time {
				display: inline-block;
				font-size: 16px;
				margin: 10px;
				vertical-align: middle;
				width: 70px;
			}

			.d2l-video-producer-chapter-time.active-chapter {
				color: var(--d2l-color-celestine);
			}

			.d2l-video-producer-chapter-set-chapter-time-button {
				margin-right: 7px;
			}

			.d2l-video-producer-new-chapter-footer {
				display: flex;
				padding: 4px;
				text-align: center;
			}

			.d2l-video-producer-new-chapter-button,
			.d2l-video-producer-new-chapter-title-input {
				padding: 3px;
			}
		`];
	}

	constructor() {
		super();
		this.loading = true;
		this.chapters = [];
		this._newChapterTitle = '';
		this._activeChapterIndex = null;
	}

	render() {
		return html`
			<div class="d2l-video-producer-chapters">
				<h3 class="d2l-heading-3 d2l-video-producer-chapters-heading">
					${this.localize('tableOfContents')}
					<div class="d2l-body-small ${this._editingOverrides ? '' : 'hidden'}">
						${this.localize('editingOverrides', { language: this.selectedLanguage && this.selectedLanguage.name })}
					</div>
				</h3>
				<div class="d2l-video-producer-chapters-container">
					${this._renderChapters()}
				</div>
				<div class="d2l-video-producer-new-chapter-footer">
					<d2l-button-icon
						?disabled="${!this._newChapterTitle}"
						@click=${this._addNewChapter}
						class="d2l-video-producer-new-chapter-button"
						icon="tier1:plus-default"
						text="${this.localize('addNewChapter')}"
					></d2l-button-icon>
					<d2l-input-text
						@keyup="${this._handleNewChapterInputTextEnter}"
						@input="${this._handleNewChapterInputTextInput}"
						class="d2l-video-producer-new-chapter-title-input"
						placeholder="${this.localize('chapterTitle')}"
					></d2l-input-text>
				</div>
			</div>
		`;
	}

	updated(changedProperties) {
		if (changedProperties.has('chapters') && !this.loading) {
			if (this.chapters[this._activeChapterIndex]) {
				this._updateActiveChapterIndex(
					this._activeChapterIndex,
					this.chapters[this._activeChapterIndex].time
				);
			} else {
				this._updateActiveChapterIndex(null);
			}
		}
	}

	addNewChapter(chapterTime) {
		if (!this._newChapterTitle) {
			return;
		}

		const chapters = [...this.chapters];
		chapters.push({
			time: chapterTime,
			title: {
				[this.selectedLanguage.code]: this._newChapterTitle,
			}
		});
		this._fireChaptersChangedEvent(chapters);
		this._updateActiveChapterIndex(chapters.length - 1, chapterTime);

		this._newChapterTitle = '';
		this.shadowRoot.querySelector('.d2l-video-producer-new-chapter-title-input').value = '';
	}

	setChapterToTime(chapterTime) {
		const updatedChapters = this.chapters.slice();
		const updatedChapter = {
			...this.chapters[this._activeChapterIndex],
			time: chapterTime
		};
		updatedChapters[this._activeChapterIndex] = updatedChapter;
		this._fireChaptersChangedEvent(updatedChapters);

		const indexOfUpdatedChapter = this._sortedChapters.findIndex(({ originalIndex }) =>
			originalIndex === this._activeChapterIndex);

		if (indexOfUpdatedChapter > -1) {
			this._updateActiveChapterIndex(this._activeChapterIndex, chapterTime);
			const inputTextOfUpdatedChapter = [...this.shadowRoot
				.querySelectorAll('.d2l-video-producer-chapter d2l-input-text')
			][indexOfUpdatedChapter];

			inputTextOfUpdatedChapter.blur();
			return;
		}

		this._updateActiveChapterIndex(null);
	}

	_addNewChapter() {
		this.dispatchEvent(new CustomEvent(
			'add-new-chapter',
			{ bubbles: true, composed: false }
		));
	}

	_deleteChapter(index) {
		return () => {
			this._updateActiveChapterIndex(null);
			const chapters = [...this.chapters];
			chapters.splice(index, 1);
			this._fireChaptersChangedEvent(chapters);
		};
	}

	get _editingOverrides() {
		if (!(this.selectedLanguage && this.defaultLanguage)) {
			return false;
		}
		return this.selectedLanguage.code !== this.defaultLanguage.code;
	}

	_fireChaptersChangedEvent(chapters) {
		this.dispatchEvent(new CustomEvent(
			'chapters-changed',
			{ bubbles: true, composed: false, detail: { chapters } }
		));
	}

	_getTime(time) {
		return new Date(time * 1000).toISOString().substr(11, 8);
	}

	_handleNewChapterInputTextEnter({ key }) {
		if (key === 'Enter') {
			this._addNewChapter();
		}
	}

	_handleNewChapterInputTextInput({ target: { value } }) {
		this._newChapterTitle = value;
	}

	_renderChapters() {
		if (this.loading) {
			return html`<d2l-loading-spinner size="150"></d2l-loading-spinner>`;
		}

		if (this.chapters.length === 0) {
			return html`
				<p class="d2l-body-standard">${this.localize('noChapters')}</p>
			`;
		}

		return this._sortedChapters.map(({ time, title, originalIndex }) => {
			const chapterTitle = title[this.selectedLanguage.code] || '';
			const fallbackTitle = title[this.defaultLanguage.code] || '';

			return html`
				<div class="d2l-video-producer-chapter">
					<d2l-input-text
						@click=${this._selectChapter(originalIndex)}
						@change=${this._updateChapterTitle(originalIndex)}
						inline-edit
						class="form-control"
						value=${chapterTitle}
						placeholder=${fallbackTitle}
					></d2l-input-text>
					<p class="${this._activeChapterIndex === originalIndex ? 'active-chapter' : ''} d2l-video-producer-chapter-time">
						${this._getTime(time)}
					</p>
					<d2l-button-icon
						@click="${this._setChapterToCurrentTime(originalIndex)}"
						class="d2l-video-producer-chapter-set-chapter-time-button"
						icon="tier1:time"
						text=${this.localize('timeToSeekPosition')}
					></d2l-button-icon>
					<d2l-button-icon
						@click="${this._deleteChapter(originalIndex)}"
						icon="tier1:close-default"
						text="${this.localize('delete')}"
					></d2l-button-icon>
				</div>
			`;
		});
	}

	_selectChapter(index) {
		return () => this._updateActiveChapterIndex(index, this.chapters[index].time);
	}

	_setChapterToCurrentTime(index) {
		return (event) => {
			event.target.blur();
			this._activeChapterIndex = index;
			this.dispatchEvent(new CustomEvent(
				'set-chapter-to-current-time',
				{ bubbles: true, composed: false }
			));
		};
	}

	get _sortedChapters() {
		return this.chapters.map((chapter, index) => ({
			...chapter,
			originalIndex: index // Used to index into this.chapters
		})).sort((a, b) => parseFloat(a.time) - parseFloat(b.time));
	}

	_updateActiveChapterIndex(index, time) {
		this._activeChapterIndex = index;
		this.dispatchEvent(new CustomEvent(
			'active-chapter-updated',
			{ bubbles: true, composed: false, detail: {
				chapterTime: index === null ? null : time
			}}
		));
	}

	_updateChapterTitle(index) {
		return event => {
			const chapters = [...this.chapters];
			chapters[index].title[this.selectedLanguage.code] = event.target.value;
			this._fireChaptersChangedEvent(chapters);
		};
	}
}
customElements.define('d2l-labs-video-producer-chapters', VideoProducerChapters);
