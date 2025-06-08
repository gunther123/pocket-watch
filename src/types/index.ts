
export type BillFrequency = 'one-time' | 'weekly' | 'bi-weekly' | 'tri-weekly' | 'monthly';
export type PayFrequency = 'weekly' | 'bi-weekly' | 'monthly';

export interface Bill {
  id: string; // Using a simple string ID for localStorage
  name: string;
  amount: number;
  nextDueDate: Date;
  frequency: BillFrequency;
}

export interface PayPeriodConfig {
  payAmount: number;
  lastPayday: Date;
  payFrequency: PayFrequency;
}
    

    