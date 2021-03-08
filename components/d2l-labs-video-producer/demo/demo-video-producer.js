import '../src/video-producer.js';
import '../src/video-producer-chapters.js';
import '../src/video-producer-language-selector.js';
import '@brightspace-ui/core/components/alert/alert-toast.js';
import '@brightspace-ui/core/components/loading-spinner/loading-spinner.js';
import '@brightspace-ui/core/components/button/button-icon.js';
import '@brightspace-ui/core/components/button/button.js';

import { css, html, LitElement } from 'lit-element/lit-element.js';
class DemoVideoProducer extends LitElement {
	static get properties() {
		return {
			languages: { type: Array },
			metadata: { type: Object },
			defaultLanguage: { type: Object },
			selectedLanguage: { type: Object },
			_loading: { type: Boolean },
			_saving: { type: Boolean },
			_publishing: { type: Boolean },
		};
	}

	static get styles() {
		return css`
			.demo-video-producer {
				width: 1170px;
			}

			.demo-video-producer-controls {
				align-items: center;
				display: flex;
				justify-content: flex-end;
				margin-bottom: 15px;
			}

			.demo-video-producer-controls-save-button {
				margin-right: auto;
			}

			.demo-video-producer-controls-publish-button {
				margin-left: 10px;
			}
			.demo-video-producer-controls-publish-button .demo-video-producer-controls-publishing-button {
				display: flex;
				align-items: center;
			}
			.demo-video-producer-controls-publish-button d2l-loading-spinner {
				margin-right: 5px;
			}
		`;
	}

	constructor() {
		super();
		this.languages = [];
		this.metadata = { cuts: [], chapters: [] };
		this.fetchAndSetData();
		this._saving = false;
		this._publishing = false;
		this.errorOccurred = false;
		this._alertMessage = '';
	}

	render() {
		return html`
			<div class="demo-video-producer">
				<div class="demo-video-producer-controls">
					<d2l-button-icon
						?disabled="${this._saving || this._publishing || this._loading}"
						@click="${this._handleSave}"
						class="demo-video-producer-controls-save-button"
						icon="tier1:save"
						primary
						text="Save"
					></d2l-button-icon>
					<d2l-labs-video-producer-language-selector
						.languages="${this.languages}"
						.selectedLanguage="${this.selectedLanguage}"
						@selected-language-changed="${this._handleSelectedLanguageChanged}"
					></d2l-labs-video-producer-language-selector>
					<d2l-button
						?disabled="${this._saving || this._publishing || this._loading}"
						@click="${this._handlePublish}"
						class="demo-video-producer-controls-publish-button"
						primary
					><div class="demo-video-producer-controls-publishing-button" style="${!this._publishing ? 'display: none' : ''}">
							<d2l-loading-spinner size="20"></d2l-loading-spinner>
							Publishing
						</div>
						<div ?hidden="${this._publishing}">
							Publish
						</div>
					</d2l-button>
				</div>

				<d2l-labs-video-producer
					.defaultLanguage="${this.defaultLanguage}"
					.metadata="${this.metadata}"
					.selectedLanguage="${this.selectedLanguage}"
					@metadata-changed="${this._handleMetadataChanged}"
					src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
				></d2l-labs-video-producer>

				<d2l-alert-toast type="default">
					${this._alertMessage}
				</d2l-alert-toast>
			</div>
		`;
	}

	async fetchAndSetData() {
		await new Promise(resolve => setTimeout(resolve, 500));
		this.languages = [{
			name: 'English (United States)',
			code: 'en-us',
			isDefault: true,
		}, {
			name: 'Français (Canada)',
			code: 'fr-fr',
			isDefault: false
		}];

		this.selectedLanguage = this.languages.find(language => language.isDefault);
		this.defaultLanguage = this.selectedLanguage;

		this.metadata = {
			chapters: [{
				time: 50,
				title: {
					'en-us': 'Chapter 1',
					'fr-fr': 'Çhàptêr 1',
				}
			}, {
				time: 150,
				title: {
					'en-us': 'Chapter 2',
					'fr-fr': 'Chaptér 2',
				}
			}, {
				time: 500,
				title: {
					'en-us': 'Ch 1',
					'fr-fr': 'Fr Ch 2'
				}
			}],
			cuts: [{ in: 10, out: 60 }, { in: 400, out: 515 }],
		};
	}

	_handleMetadataChanged(e) {
		console.log('Metadata changed:', e.detail);
		this.metadata = e.detail;
	}

	async _handlePublish() {
		this._publishing = true;
		console.log('Publishing metadata:', this.metadata);
		await new Promise(resolve => setTimeout(resolve, 1000));
		this._publishing = false;
		this._alertMessage = 'Publish successful.';
		this.shadowRoot.querySelector('d2l-alert-toast').open = true;
	}

	async _handleSave() {
		this._saving = true;
		console.log('Saving draft metadata:', this.metadata);
		await new Promise(resolve => setTimeout(resolve, 1000));
		this._saving = false;

		this._alertMessage = 'Saved changes.';
		this.shadowRoot.querySelector('d2l-alert-toast').open = true;
	}

	_handleSelectedLanguageChanged(e) {
		this.selectedLanguage = e.detail.selectedLanguage;
	}

	get _loading() {
		return !(this.metadata && this.languages.length > 0);
	}
}

customElements.define('d2l-labs-video-producer-demo-producer', DemoVideoProducer);
