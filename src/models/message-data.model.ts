export interface MessageData<T = any> {
  id: string;
  type: string;
  topic: string;
  subject: string;
  data: T;
}
