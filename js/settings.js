import { getApiKeys, setApiKeys } from './utils.js';

export class SettingsPanel {
  constructor() {
    this.dialog = document.getElementById('settings-dialog');
    this._init();
  }
  
  _init() {
    // Close button
    this.dialog?.querySelector('.settings__close')?.addEventListener('click', () => this.close());
    
    // Save button
    this.dialog?.querySelector('.settings__save')?.addEventListener('click', () => this.save());

    // Bind clear buttons (dustbin icons)
    this.dialog?.querySelectorAll('.settings__clear-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        this.clearKey(targetId);
      });
    });
    
    // Toggle password visibility for API key inputs
    this.dialog?.querySelectorAll('.settings__toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.textContent = isPassword ? '🙈' : '👁️';
        }
      });
    });
    
    // Close on backdrop click
    this.dialog?.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.close();
    });
    
    // Close on Escape
    this.dialog?.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.close();
    });
  }

  clearKey(targetId) {
    const input = this.dialog?.querySelector(`#${targetId}`);
    if (input && input.value) {
      const fieldName = targetId === 'gemini-key' ? 'Gemini API Key' 
                      : targetId === 'weather-key' ? 'OpenWeather API Key' 
                      : 'Unsplash Access Key';
                      
      if (confirm(`Are you sure you want to delete the saved ${fieldName}?`)) {
        input.value = '';
        this.saveQuietly();
      }
    }
  }

  saveQuietly() {
    const gemini = this.dialog?.querySelector('#gemini-key')?.value?.trim() || '';
    const openweather = this.dialog?.querySelector('#weather-key')?.value?.trim() || '';
    const unsplash = this.dialog?.querySelector('#unsplash-key')?.value?.trim() || '';
    const model = this.dialog?.querySelector('#gemini-model')?.value || 'gemini-2.0-flash';
    
    setApiKeys({ gemini, openweather, unsplash, model });
    
    // Dispatch custom event so app knows keys changed
    window.dispatchEvent(new CustomEvent('settings-changed'));
  }
  
  open() {
    // Load current keys into inputs
    const keys = getApiKeys();
    const geminiInput = this.dialog?.querySelector('#gemini-key');
    const weatherInput = this.dialog?.querySelector('#weather-key');
    const unsplashInput = this.dialog?.querySelector('#unsplash-key');
    const modelSelect = this.dialog?.querySelector('#gemini-model');
    
    if (geminiInput) geminiInput.value = keys.gemini || '';
    if (weatherInput) weatherInput.value = keys.openweather || '';
    if (unsplashInput) unsplashInput.value = keys.unsplash || '';
    if (modelSelect) modelSelect.value = keys.model || 'gemini-2.0-flash';
    
    this.dialog?.showModal();
  }
  
  save() {
    const gemini = this.dialog?.querySelector('#gemini-key')?.value?.trim() || '';
    const openweather = this.dialog?.querySelector('#weather-key')?.value?.trim() || '';
    const unsplash = this.dialog?.querySelector('#unsplash-key')?.value?.trim() || '';
    const model = this.dialog?.querySelector('#gemini-model')?.value || 'gemini-2.0-flash';
    
    setApiKeys({ gemini, openweather, unsplash, model });
    this.close();
    
    // Dispatch custom event so app knows keys changed
    window.dispatchEvent(new CustomEvent('settings-changed'));
  }
  
  close() {
    this.dialog?.close();
  }
  
  // Check if minimum required keys are set
  hasRequiredKeys() {
    const keys = getApiKeys();
    return !!(keys.gemini);
  }
}
