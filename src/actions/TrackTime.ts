import { KeyDownEvent, WillAppearEvent } from "@fnando/streamdeck";
import { TrackTimeSettings } from "../JiraPluginSettings";
import BaseJiraAction, { CountableResponse } from "./BaseJiraAction";
import { ActionPollingContext } from "./PollingAction";
import { TimerState } from "../models/TimerState";
import WorklogService from "../services/WorklogService";

/**
 * Response structure for Jira issue details.
 */
interface IssueDetailsResponse {
  key: string;
  fields: {
    summary: string;
    subtasks: Array<{
      key: string;
      fields: {
        summary: string;
      };
    }>;
  };
}

/**
 * Response structure for issue search.
 */
interface IssueSearchResponse {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
    };
  }>;
}

/**
 * A timer action that tracks time and logs it to Jira Cloud as worklogs.
 * 
 * Features:
 * - Issue and subtask selection via Jira API
 * - Start/stop timer on key press
 * - Persistent state across restarts
 * - Automatic worklog creation when stopped
 * - Visual feedback with elapsed time display
 */
class TrackTime extends BaseJiraAction<CountableResponse<{}>, TrackTimeSettings> {
  private timerInterval: NodeJS.Timeout | null = null;
  private timerState: TimerState | null = null;

  /**
   * {@inheritDoc}
   */
  handleWillAppear(event: WillAppearEvent<TrackTimeSettings>): void {
    super.handleWillAppear(event);
    this.restoreTimerState(event.settings);
    this.updateDisplay(event.settings);
  }

  /**
   * {@inheritDoc}
   */
  handleKeyDown(event: KeyDownEvent<TrackTimeSettings>): void {
    super.handleKeyDown(event);

    if (!event.settings.issueKey) {
      this.showAlert();
      return;
    }

    if (!this.timerState || !this.timerState.running) {
      // Start timer
      this.startTimer(event.settings);
    } else {
      // Stop timer and create worklog
      this.stopTimer(event.settings);
    }
  }

  /**
   * {@inheritDoc}
   */
  protected async getResponse(context: ActionPollingContext<TrackTimeSettings>): Promise<CountableResponse<{}>> {
    // This action doesn't poll for data, so we return an empty response
    // The count is always 0 because there's no meaningful count to display
    return {
      count: 0,
    };
  }

  /**
   * Restores the timer state from persistent settings.
   * 
   * If a timer was running when Stream Deck was closed, this will resume it.
   * 
   * @param settings - The action settings.
   */
  private restoreTimerState(settings: TrackTimeSettings): void {
    try {
      if (settings.timerState) {
        this.timerState = JSON.parse(settings.timerState);

        // If the timer was running, restart it
        if (this.timerState && this.timerState.running) {
          this.resumeTimer(settings);
        }
      }
    } catch (error) {
      this.debug('Failed to restore timer state:', error);
      this.timerState = null;
    }
  }

  /**
   * Saves the timer state to persistent settings.
   * 
   * @param settings - The action settings to update.
   */
  private saveTimerState(settings: TrackTimeSettings): void {
    if (this.timerState) {
      const updatedSettings = { ...settings };
      updatedSettings.timerState = JSON.stringify(this.timerState);
      this.setSettings(updatedSettings);
    }
  }

  /**
   * Starts a new timer.
   * 
   * @param settings - The action settings.
   */
  private startTimer(settings: TrackTimeSettings): void {
    const now = Math.floor(Date.now() / 1000);

    this.timerState = {
      running: true,
      issueKey: settings.issueKey,
      subtaskKey: settings.subtaskKey,
      subtaskName: settings.subtaskName,
      startTime: now,
    };

    this.saveTimerState(settings);
    this.resumeTimer(settings);
  }

  /**
   * Resumes a paused or restored timer.
   * 
   * @param settings - The action settings.
   */
  private resumeTimer(settings: TrackTimeSettings): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Update display every second
    this.timerInterval = setInterval(() => {
      this.updateDisplay(settings);
    }, 1000);

    this.updateDisplay(settings);
  }

  /**
   * Stops the timer and creates a worklog in Jira.
   * 
   * @param settings - The action settings.
   */
  private stopTimer(settings: TrackTimeSettings): void {
    if (!this.timerState || !this.timerState.running) {
      return;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - this.timerState.startTime;
    const elapsedMinutes = elapsedSeconds / 60;

    // Determine which key to log time to (subtask or main issue)
    const targetKey = this.timerState.subtaskKey || this.timerState.issueKey;

    // Create worklog
    WorklogService.createWorklog(targetKey, elapsedMinutes, settings)
      .then(() => {
        // Clear timer state after successful worklog
        this.timerState = {
          running: false,
          issueKey: settings.issueKey,
          subtaskKey: settings.subtaskKey,
          subtaskName: settings.subtaskName,
          startTime: 0,
        };
        this.saveTimerState(settings);
        this.updateDisplay(settings);
      })
      .catch((error) => {
        this.debug('Failed to create worklog:', error);
        this.showAlert();
        
        // Stop timer but keep state so user can retry
        if (this.timerState) {
          this.timerState.running = false;
        }
        this.updateDisplay(settings);
      });
  }

  /**
   * Updates the visual display of the timer.
   * 
   * Shows elapsed time and button state (play/pause).
   * 
   * @param settings - The action settings.
   */
  private updateDisplay(settings: TrackTimeSettings): void {
    let title = settings.subtaskName || settings.issueKey || 'No Issue';
    let elapsedTime = '00:00';
    let isRunning = false;

    if (this.timerState) {
      isRunning = this.timerState.running;

      if (isRunning || this.timerState.startTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const elapsedSeconds = now - this.timerState.startTime;
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;

        elapsedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }

    this.setTitle(`${title}\n${elapsedTime}`);
  }

  /**
   * Gets the subtasks for a given issue.
   * 
   * @param issueKey - The issue key (e.g., "ENV-234").
   * @param settings - The action settings.
   * @returns Array of subtask objects with key and summary.
   * @throws RequestError if the API call fails.
   */
  public async getSubtasks(
    issueKey: string,
    settings: TrackTimeSettings
  ): Promise<Array<{ key: string; name: string }>> {
    if (!issueKey) {
      return [];
    }

    try {
      const client = this.getJiraClient(settings);

      const response = await client.request<IssueDetailsResponse>({
        endpoint: `rest/api/3/issue/${issueKey}`,
        query: {
          fields: 'summary,subtasks',
        },
      });

      const subtasks = response.body.fields.subtasks || [];
      return subtasks.map((st) => ({
        key: st.key,
        name: st.fields.summary,
      }));
    } catch (error) {
      this.debug('Failed to fetch subtasks:', error);
      return [];
    }
  }

  /**
   * Searches for issues matching a query.
   * 
   * @param query - The search query (e.g., "project = ENV").
   * @param settings - The action settings.
   * @returns Array of matching issues with key and summary.
   * @throws RequestError if the API call fails.
   */
  public async searchIssues(
    query: string,
    settings: TrackTimeSettings
  ): Promise<Array<{ key: string; summary: string }>> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      const client = this.getJiraClient(settings);

      const response = await client.request<IssueSearchResponse>({
        endpoint: `rest/api/3/search`,
        query: {
          jql: query,
          fields: 'summary',
          maxResults: 50,
        },
      });

      return response.body.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary,
      }));
    } catch (error) {
      this.debug('Failed to search issues:', error);
      return [];
    }
  }
}

const trackTime = new TrackTime({
  name: 'Track Time',
  hasMultiActionSupport: false,
  tooltip: 'Track time on Jira issues and automatically log worklogs.',
  states: [{ image: 'TrackTime' }],
  inspectorName: 'TrackTime',
});

export default trackTime;
