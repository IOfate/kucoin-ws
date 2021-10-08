export interface MessageData<T = any> {
    type: string;
    topic: string;
    subject: string;
    data: T;
}
