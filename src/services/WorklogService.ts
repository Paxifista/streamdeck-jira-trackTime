import Client from "../Client";
import { DefaultPluginSettings } from "../JiraPluginSettings";
import { JiraConnection } from "../JiraConnection";

/**
 * Request body for creating a worklog in Jira.
 */
interface WorklogRequest {
  /**
   * Time spent on the issue/subtask in minutes format (e.g., "103m").
   */
  timeSpent: string;
}

/**
 * Service for managing worklogs in Jira Cloud.
 * 
 * Handles creation and validation of time tracking entries.
 */
export default class WorklogService {
  /**
   * Creates a new worklog entry in Jira.
   *
   * @param issueKey - The issue or subtask key to log time to.
   * @param minutes - The number of minutes to log.
   * @param settings - The plugin settings for authentication.
   * @returns A promise that resolves when the worklog is created.
   * @throws RequestError if the API call fails.
   */
  public static async createWorklog(
    issueKey: string,
    minutes: number,
    settings: DefaultPluginSettings
  ): Promise<void> {
    if (!issueKey || minutes <= 0) {
      throw new Error('Invalid issue key or time duration');
    }

    const client = JiraConnection.getClient(settings);

    const payload: WorklogRequest = {
      timeSpent: `${Math.round(minutes)}m`,
    };

    await client.request({
      endpoint: `rest/api/3/issue/${issueKey}/worklog`,
      method: 'POST',
      body: payload,
    });
  }
}
