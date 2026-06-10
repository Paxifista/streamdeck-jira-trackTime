/**
 * Represents the state of a running timer.
 */
export interface TimerState {
  /**
   * Whether the timer is currently running.
   */
  running: boolean;

  /**
   * The Jira issue key (e.g., "ENV-234").
   */
  issueKey: string;

  /**
   * The Jira subtask key (e.g., "ENV-240").
   * 
   * If provided, the worklog will be created on this subtask instead of the main issue.
   */
  subtaskKey?: string;

  /**
   * The display name of the selected subtask.
   */
  subtaskName?: string;

  /**
   * Unix timestamp (in seconds) when the timer started.
   */
  startTime: number;
}
