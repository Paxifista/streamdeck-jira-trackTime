import plugin from "../plugin";
import { BadgeType, TrackTimeSettings } from "../JiraPluginSettings";
import { BadgePosition } from "../Icon";
import PollingActionInspector from "../PollingActionInspector";
import { AuthenticationComponent, IconComponent } from "./Components";
import TrackTime from "../actions/TrackTime";

/**
 * Property inspector for the Track Time action.
 */
class TrackTimeActionPropertyInspector extends PollingActionInspector<TrackTimeSettings> {
  private authentication = document.getElementById('auth') as AuthenticationComponent;
  private icon = document.getElementById('icon') as IconComponent;

  private issueSearchInput = document.getElementById('issue-search') as HTMLInputElement;
  private issueSearchResults = document.getElementById('issue-search-results') as HTMLDivElement;
  private selectedIssueDiv = document.getElementById('selected-issue') as HTMLDivElement;
  private selectedIssueText = document.getElementById('selected-issue-text') as HTMLDivElement;

  private subtaskSelect = document.getElementById('subtask-select') as HTMLSelectElement;
  private noSubtasksMessage = document.getElementById('no-subtasks-message') as HTMLDivElement;
  private selectedSubtaskDiv = document.getElementById('selected-subtask') as HTMLDivElement;
  private selectedSubtaskText = document.getElementById('selected-subtask-text') as HTMLDivElement;

  private timerDisplay = document.getElementById('timer-display') as HTMLDivElement;
  private timerStatus = document.getElementById('timer-status') as HTMLDivElement;

  private debounceTimer: NodeJS.Timeout | null = null;
  private timerUpdateInterval: NodeJS.Timeout | null = null;
  private trackTimeAction: TrackTime | null = null;

  /**
   * {@inheritDoc}
   */
  handleDidConnectToSocket(): void {
    super.handleDidConnectToSocket();
    
    // Find the TrackTime action from the plugin
    this.trackTimeAction = (plugin as any).actions.find((a: any) => a.name === 'Track Time');

    this.setupEventListeners();
    this.updateForm();
    this.startTimerDisplay();
  }

  /**
   * Sets up event listeners for the form elements.
   */
  private setupEventListeners(): void {
    // Issue search input with debouncing
    this.issueSearchInput.addEventListener('input', (e) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        const query = (e.target as HTMLInputElement).value.trim();
        if (query.length === 0) {
          this.issueSearchResults.classList.remove('visible');
          return;
        }

        await this.performIssueSearch(query);
      }, 500);
    });

    // Subtask selection change
    this.subtaskSelect.addEventListener('change', (e) => {
      this.saveSettings();
      this.updateSubtaskDisplay();
    });
  }

  /**
   * Performs an issue search via the Jira API.
   * 
   * @param query - The JQL query to search.
   */
  private async performIssueSearch(query: string): Promise<void> {
    if (!this.trackTimeAction || !this.settings) {
      return;
    }

    try {
      this.issueSearchResults.innerHTML = '<div class="loading">Searching...</div>';
      this.issueSearchResults.classList.add('visible');

      const issues = await this.trackTimeAction.searchIssues(query, this.settings);

      if (issues.length === 0) {
        this.issueSearchResults.innerHTML = '<div class="loading">No issues found</div>';
        return;
      }

      this.issueSearchResults.innerHTML = issues
        .map(
          (issue) => `
            <div class="search-result-item" data-key="${issue.key}" data-summary="${issue.summary}">
              <strong>${issue.key}</strong> - ${issue.summary}
            </div>
          `
        )
        .join('');

      // Add click handlers to results
      this.issueSearchResults.querySelectorAll('.search-result-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
          const key = (item as HTMLDivElement).getAttribute('data-key');
          const summary = (item as HTMLDivElement).getAttribute('data-summary');

          if (!key) return;

          // Update the selected issue
          this.issueSearchInput.value = `${key} - ${summary}`;
          this.issueSearchResults.classList.remove('visible');

          // Load subtasks for this issue
          if (this.trackTimeAction) {
            const subtasks = await this.trackTimeAction.getSubtasks(key, this.settings!);
            this.populateSubtasks(subtasks, key);
          }

          // Update settings
          this.settings!.issueKey = key;
          this.settings!.subtaskKey = undefined;
          this.settings!.subtaskName = undefined;
          this.saveSettings();
          this.updateIssueDisplay();
        });
      });
    } catch (error) {
      this.debug('Issue search failed:', error);
      this.issueSearchResults.innerHTML = '<div class="loading">Search failed</div>';
    }
  }

  /**
   * Populates the subtask dropdown with available subtasks.
   * 
   * @param subtasks - Array of subtasks to display.
   * @param issueKey - The parent issue key.
   */
  private populateSubtasks(
    subtasks: Array<{ key: string; name: string }>,
    issueKey: string
  ): void {
    // Reset subtask select
    this.subtaskSelect.innerHTML = '<option value="">No Subtask</option>';

    if (subtasks.length === 0) {
      this.subtaskSelect.style.display = 'none';
      this.noSubtasksMessage.style.display = 'block';
      return;
    }

    this.subtaskSelect.style.display = 'block';
    this.noSubtasksMessage.style.display = 'none';

    subtasks.forEach((subtask) => {
      const option = document.createElement('option');
      option.value = subtask.key;
      option.textContent = `${subtask.key} - ${subtask.name}`;
      this.subtaskSelect.appendChild(option);
    });
  }

  /**
   * Updates the display showing the selected issue.
   */
  private updateIssueDisplay(): void {
    if (this.settings?.issueKey) {
      this.selectedIssueText.textContent = this.settings.issueKey;
      this.selectedIssueDiv.style.display = 'block';
    } else {
      this.selectedIssueDiv.style.display = 'none';
    }
  }

  /**
   * Updates the display showing the selected subtask.
   */
  private updateSubtaskDisplay(): void {
    if (this.settings?.subtaskKey) {
      this.selectedSubtaskText.textContent = `${this.settings.subtaskKey} - ${this.settings.subtaskName}`;
      this.selectedSubtaskDiv.style.display = 'block';
    } else {
      this.selectedSubtaskDiv.style.display = 'none';
    }
  }

  /**
   * Starts the timer display update interval.
   * 
   * Updates the visual timer display every second.
   */
  private startTimerDisplay(): void {
    if (this.timerUpdateInterval) {
      clearInterval(this.timerUpdateInterval);
    }

    this.timerUpdateInterval = setInterval(() => {
      this.updateTimerDisplay();
    }, 500);

    this.updateTimerDisplay();
  }

  /**
   * Updates the timer display UI.
   */
  private updateTimerDisplay(): void {
    if (!this.settings?.timerState) {
      this.timerDisplay.textContent = '00:00';
      this.timerStatus.textContent = 'Ready to start';
      return;
    }

    try {
      const timerState = JSON.parse(this.settings.timerState);

      if (!timerState.running) {
        this.timerDisplay.textContent = '00:00';
        this.timerStatus.textContent = 'Stopped';
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const elapsedSeconds = now - timerState.startTime;
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;

      this.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      this.timerStatus.textContent = `Running on ${timerState.subtaskKey || timerState.issueKey}`;
    } catch (error) {
      this.timerDisplay.textContent = '00:00';
      this.timerStatus.textContent = 'Error reading state';
    }
  }

  /**
   * {@inheritDoc}
   */
  protected updateForm(): void {
    const settings = Object.assign({}, this.getDefaultSettings(), this.settings);

    this.authentication.value = settings;
    this.icon.value = settings;

    this.updateIssueDisplay();
    this.updateSubtaskDisplay();
  }

  /**
   * {@inheritdoc}
   */
  protected handleFieldUpdated(event: Event): void {
    this.saveSettings();
  }

  /**
   * "Submits" the form and saves all values to settings.
   */
  protected saveSettings(): void {
    const settings: TrackTimeSettings = {
      issueKey: this.settings?.issueKey || '',
      subtaskKey: this.subtaskSelect.value || undefined,
      subtaskName: this.subtaskSelect.selectedIndex > 0 
        ? this.subtaskSelect.options[this.subtaskSelect.selectedIndex].textContent?.split(' - ')[1]
        : undefined,
      timerState: this.settings?.timerState,
      pollingDelay: 5,
      ...this.authentication.value,
      ...this.icon.value,
    };

    this.setSettings(settings);
    this.setGlobalSettings({
      domain: settings.domain,
      context: settings.context,
      email: settings.email,
      token: settings.token,
      strategy: settings.strategy,
    });
  }

  /**
   * {@inheritdoc}
   */
  protected getDefaultSettings(): TrackTimeSettings {
    return {
      domain: this.globalSettings.domain ?? '',
      context: this.globalSettings.context ?? '',
      email: this.globalSettings.email ?? '',
      token: this.globalSettings.token ?? '',
      strategy: this.globalSettings.strategy ?? 'APIToken',
      issueKey: '',
      pollingDelay: 5,
      badgeType: BadgeType.Indicator,
      badgePosition: BadgePosition.TopRight,
    };
  }
}

const inspector = new TrackTimeActionPropertyInspector({ plugin });
inspector.run();
