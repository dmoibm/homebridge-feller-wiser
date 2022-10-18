export interface SmbAction{
  id?: number;
  action?: 'click' | 'single' | 'double' | 'long';
  type?: string;
}