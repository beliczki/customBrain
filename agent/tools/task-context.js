import { searchThoughts } from '../../server/routes/search.js';

export async function getTaskContext(taskTitle) {
  const brainResults = await searchThoughts(taskTitle, 10);
  return {
    task: taskTitle,
    brain_context: brainResults,
  };
}
