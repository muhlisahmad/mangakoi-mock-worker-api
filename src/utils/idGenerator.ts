import { v4 as uuidv4 } from 'uuid';

export function generateJobId(): string {
  return uuidv4();
}
