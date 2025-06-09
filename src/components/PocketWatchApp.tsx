
"use client";

import type { Bill, BillFrequency, PayPeriodConfig } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isAfter,
  isBefore,
  isEqual,
  startOfDay,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  subWeeks,
  subMonths,
} from 'date-fns';
import { CalendarIcon, Loader2, PlusCircle, Trash2, Wallet, Info, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const billSchema = z.object({
  name: z.string().min(1, 'Bill name is required.'),
  amount: z.coerce.number().positive('Amount must be positive.').optional().default(0),
  nextDueDate: z.date({ required_error: 'Next due date is required.' }).optional(),
  frequency: z.enum(['one-time', 'weekly', 'bi-weekly', 'tri-weekly', 'monthly'], { required_error: 'Frequency is required.' }),
  isExistingRecurring: z.boolean().optional().default(false),
});

const payPeriodSchema = z.object({
  payAmount: z.coerce.number().positive('Pay amount must be positive.').optional().default(0),
  lastPayday: z.date({ required_error: 'Last payday is required.' }).optional(),
  payFrequency: z.enum(['weekly', 'bi-weekly', 'monthly'], { required_error: 'Pay frequency is required.' }),
});

type BillFormData = z.infer<typeof billSchema>;
type PayPeriodFormData = z.infer<typeof payPeriodSchema>;

interface MonthlySummary {
  income: number;
  bills: number;
  net: number;
}

export default function PocketWatchApp() {
  const { toast } = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [payPeriodConfig, setPayPeriodConfig] = useState<PayPeriodConfig | null>(null);
  const [leftoverMoney, setLeftoverMoney] = useState<number | null>(null);
  const [currentPayPeriodDates, setCurrentPayPeriodDates] = useState<{ start: Date; end: Date } | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [billsDueThisPayPeriod, setBillsDueThisPayPeriod] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllDueBills, setShowAllDueBills] = useState(false);

  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [isBillFormDialogOpen, setIsBillFormDialogOpen] = useState(false);


  const billForm = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      name: '',
      amount: 0,
      nextDueDate: undefined,
      frequency: 'monthly',
      isExistingRecurring: false,
    },
  });

  const payPeriodForm = useForm<PayPeriodFormData>({
    resolver: zodResolver(payPeriodSchema),
    defaultValues: {
      payAmount: 0,
      lastPayday: undefined,
      payFrequency: 'bi-weekly',
    },
  });

  const selectedFrequency = billForm.watch('frequency');

  useEffect(() => {
    setIsLoading(true);
    try {
      const storedBills = localStorage.getItem('pocketWatchBills');
      if (storedBills) {
        const parsedBills: Bill[] = JSON.parse(storedBills).map((bill: any) => ({
          ...bill,
          nextDueDate: new Date(bill.nextDueDate),
          isExistingRecurring: bill.frequency !== 'one-time' && bill.isExistingRecurring === undefined
                               ? true
                               : !!bill.isExistingRecurring,
        }));
        setBills(parsedBills);
      }

      const storedConfig = localStorage.getItem('pocketWatchPayPeriodConfig');
      if (storedConfig) {
        const parsedConfig: PayPeriodConfig = JSON.parse(storedConfig);
        const configWithDate = {
          ...parsedConfig,
          lastPayday: parsedConfig.lastPayday ? new Date(parsedConfig.lastPayday) : new Date(),
        };
        setPayPeriodConfig(configWithDate);
        payPeriodForm.reset({
          payAmount: configWithDate.payAmount,
          lastPayday: configWithDate.lastPayday,
          payFrequency: configWithDate.payFrequency,
        });
      } else {
         payPeriodForm.reset({
           payAmount: 0,
           lastPayday: undefined,
           payFrequency: 'bi-weekly',
        });
      }
    } catch (error) {
      console.error("Error loading data from localStorage:", error);
      toast({ title: "Error", description: "Could not load saved data.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [toast, payPeriodForm]);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('pocketWatchBills', JSON.stringify(bills));
    }
  }, [bills, isLoading]);

  useEffect(() => {
    if (!isLoading && payPeriodConfig) {
      localStorage.setItem('pocketWatchPayPeriodConfig', JSON.stringify(payPeriodConfig));
    }
  }, [payPeriodConfig, isLoading]);


  const calculateNextOccurrence = (currentDate: Date, frequency: BillFrequency): Date => {
    switch (frequency) {
      case 'weekly': return addWeeks(currentDate, 1);
      case 'bi-weekly': return addWeeks(currentDate, 2);
      case 'tri-weekly': return addWeeks(currentDate, 3);
      case 'monthly': return addMonths(currentDate, 1);
      default: return currentDate;
    }
  };

  const calculatePreviousOccurrence = (currentDate: Date, frequency: BillFrequency): Date => {
    switch (frequency) {
      case 'weekly': return subWeeks(currentDate, 1);
      case 'bi-weekly': return subWeeks(currentDate, 2);
      case 'tri-weekly': return subWeeks(currentDate, 3);
      case 'monthly': return subMonths(currentDate, 1);
      default: return currentDate;
    }
  };

 useEffect(() => {
    if (!payPeriodConfig || !payPeriodConfig.lastPayday) {
      setLeftoverMoney(null);
      setCurrentPayPeriodDates(null);
      setMonthlySummary(null);
      setBillsDueThisPayPeriod([]);
      return;
    }

    const today = startOfDay(new Date());
    const currentMonthStart = startOfDay(startOfMonth(today));
    const currentMonthEnd = startOfDay(endOfMonth(today));

    const { payAmount, lastPayday, payFrequency } = payPeriodConfig;
    let resolvedLastPayday = startOfDay(lastPayday);

    let periodStartDate = resolvedLastPayday;
    let periodEndDate: Date;

    switch (payFrequency) {
      case 'weekly':
        periodEndDate = startOfDay(addWeeks(periodStartDate, 1));
        while (isBefore(periodEndDate, today)) {
            periodStartDate = periodEndDate;
            periodEndDate = startOfDay(addWeeks(periodStartDate, 1));
        }
        break;
      case 'bi-weekly':
        periodEndDate = startOfDay(addWeeks(periodStartDate, 2));
        while (isBefore(periodEndDate, today)) {
            periodStartDate = periodEndDate;
            periodEndDate = startOfDay(addWeeks(periodStartDate, 2));
        }
        break;
      case 'monthly':
        periodEndDate = startOfDay(addMonths(periodStartDate, 1));
        periodStartDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), resolvedLastPayday.getDate()));
        if (isAfter(periodStartDate, today)) {
            periodStartDate = subMonths(periodStartDate, 1);
        }
        periodEndDate = startOfDay(addMonths(periodStartDate, 1));

        while (isBefore(periodEndDate, today)) {
            periodStartDate = periodEndDate;
            periodEndDate = startOfDay(addMonths(periodStartDate, 1));
        }
        break;
      default: return;
    }

    setCurrentPayPeriodDates({ start: periodStartDate, end: periodEndDate });

    let totalBillsInPayPeriod = 0;
    const dueBillsInPeriod: Bill[] = [];

    bills.forEach(bill => {
      const billAnchorDate = startOfDay(bill.nextDueDate);

      if (bill.frequency === 'one-time') {
        if (isWithinInterval(billAnchorDate, { start: periodStartDate, end: addDays(periodEndDate, -1) })) {
          totalBillsInPayPeriod += bill.amount;
          dueBillsInPeriod.push({ ...bill, nextDueDate: billAnchorDate });
        }
        return;
      }

      let currentProcessingDate = billAnchorDate;

      if (bill.isExistingRecurring) {
        if (isBefore(currentProcessingDate, periodStartDate)) {
          while (isBefore(currentProcessingDate, periodStartDate)) {
            const advancedDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
            if (isEqual(advancedDate, currentProcessingDate)) break;
            currentProcessingDate = advancedDate;
          }
        } else {
          while (isAfter(currentProcessingDate, periodStartDate) || isEqual(currentProcessingDate, periodStartDate)) {
            const prevDate = startOfDay(calculatePreviousOccurrence(currentProcessingDate, bill.frequency));
            if (isBefore(prevDate, periodStartDate)) break;
            if (isEqual(prevDate, currentProcessingDate)) break;
            currentProcessingDate = prevDate;
            if (isBefore(currentProcessingDate, new Date("1900-01-01"))) break;
          }
           if (isBefore(currentProcessingDate, periodStartDate)) {
             currentProcessingDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
           }
        }
      } else {
        if (isBefore(currentProcessingDate, periodStartDate)) {
          while (isBefore(currentProcessingDate, periodStartDate)) {
            const advancedDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
            if (isEqual(advancedDate, currentProcessingDate)) break;
            currentProcessingDate = advancedDate;
          }
        }
      }

      while (isBefore(currentProcessingDate, periodEndDate)) {
        if (isWithinInterval(currentProcessingDate, { start: periodStartDate, end: addDays(periodEndDate,-1) })) {
            totalBillsInPayPeriod += bill.amount;
            dueBillsInPeriod.push({ ...bill, nextDueDate: currentProcessingDate });
        }

        const nextCalculatedDueDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
        if (isEqual(nextCalculatedDueDate, currentProcessingDate)) {
           console.warn(`Bill ${bill.name} frequency ${bill.frequency} did not advance date in pay period calc. Breaking loop.`);
           break;
        }
        currentProcessingDate = nextCalculatedDueDate;
      }
    });

    setBillsDueThisPayPeriod(dueBillsInPeriod.sort((a,b) => a.nextDueDate.getTime() - b.nextDueDate.getTime()));
    setLeftoverMoney(payAmount - totalBillsInPayPeriod);

    let calculatedMonthlyIncome = 0;
    if (payPeriodConfig.payFrequency === 'monthly') {
        calculatedMonthlyIncome = 0;
        let tempPayDate = startOfDay(payPeriodConfig.lastPayday);
        while(isAfter(tempPayDate, currentMonthStart)) {
            tempPayDate = subMonths(tempPayDate,1);
        }
        while(isBefore(tempPayDate, currentMonthStart) || !isEqual(tempPayDate.getDate(), payPeriodConfig.lastPayday.getDate())) {
            tempPayDate = addMonths(tempPayDate,1);
            tempPayDate = startOfDay(new Date(tempPayDate.getFullYear(), tempPayDate.getMonth(), payPeriodConfig.lastPayday.getDate()));
        }
        if (isWithinInterval(tempPayDate, {start: currentMonthStart, end: currentMonthEnd})) {
            calculatedMonthlyIncome += payPeriodConfig.payAmount;
        }
    } else {
      calculatedMonthlyIncome = 0;
      let currentPayDate = startOfDay(payPeriodConfig.lastPayday);
      const payIntervalWeeks = payPeriodConfig.payFrequency === 'weekly' ? 1 : 2;
      while (isAfter(currentPayDate, currentMonthStart)) {
        currentPayDate = subWeeks(currentPayDate, payIntervalWeeks);
      }
       while (isBefore(currentPayDate, currentMonthStart)) {
        currentPayDate = addWeeks(currentPayDate, payIntervalWeeks);
      }
      while (isWithinInterval(currentPayDate, {start: currentMonthStart, end: currentMonthEnd})) {
        calculatedMonthlyIncome += payPeriodConfig.payAmount;
        currentPayDate = addWeeks(currentPayDate, payIntervalWeeks);
      }
    }

    let calculatedMonthlyBills = 0;
    bills.forEach(bill => {
      const billAnchorDate = startOfDay(bill.nextDueDate);

      if (bill.frequency === 'one-time') {
        if (isWithinInterval(billAnchorDate, { start: currentMonthStart, end: currentMonthEnd })) {
          calculatedMonthlyBills += bill.amount;
        }
        return;
      }

      let currentProcessingDate = billAnchorDate;

      if (bill.isExistingRecurring) {
        if (isBefore(currentProcessingDate, currentMonthStart)) {
          while (isBefore(currentProcessingDate, currentMonthStart)) {
            const advancedDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
            if (isEqual(advancedDate, currentProcessingDate)) break;
            currentProcessingDate = advancedDate;
          }
        } else {
          while (isAfter(currentProcessingDate, currentMonthStart) || isEqual(currentProcessingDate, currentMonthStart)) {
            const prevDate = startOfDay(calculatePreviousOccurrence(currentProcessingDate, bill.frequency));
            if (isBefore(prevDate, currentMonthStart)) break;
            if (isEqual(prevDate, currentProcessingDate)) break;
            currentProcessingDate = prevDate;
             if (isBefore(currentProcessingDate, new Date("1900-01-01"))) break;
          }
           if (isBefore(currentProcessingDate, currentMonthStart)) {
             currentProcessingDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
           }
        }
      } else {
        if (isBefore(currentProcessingDate, currentMonthStart)) {
          while (isBefore(currentProcessingDate, currentMonthStart)) {
            const advancedDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
            if (isEqual(advancedDate, currentProcessingDate)) break;
            currentProcessingDate = advancedDate;
          }
        }
      }

      while (!isAfter(currentProcessingDate, currentMonthEnd)) {
         if (isWithinInterval(currentProcessingDate, {start: currentMonthStart, end: currentMonthEnd})) {
           calculatedMonthlyBills += bill.amount;
         }

         const nextCalculatedDueDate = startOfDay(calculateNextOccurrence(currentProcessingDate, bill.frequency));
         if (bill.frequency !== 'one-time' && isEqual(nextCalculatedDueDate, currentProcessingDate)) {
             console.warn(`Bill ${bill.name} frequency ${bill.frequency} did not advance date in monthly summary. Breaking loop.`);
             break;
         }
         currentProcessingDate = nextCalculatedDueDate;
      }
    });

    setMonthlySummary({
      income: calculatedMonthlyIncome,
      bills: calculatedMonthlyBills,
      net: calculatedMonthlyIncome - calculatedMonthlyBills,
    });

  }, [bills, payPeriodConfig]);

  const handleOpenAddBillDialog = () => {
    setEditingBill(null);
    billForm.reset({
      name: '',
      amount: 0,
      nextDueDate: undefined,
      frequency: 'monthly',
      isExistingRecurring: false,
    });
    setIsBillFormDialogOpen(true);
  };

  const handleOpenEditBillDialog = (bill: Bill) => {
    setEditingBill(bill);
    billForm.reset({
      name: bill.name,
      amount: bill.amount,
      nextDueDate: bill.nextDueDate,
      frequency: bill.frequency,
      isExistingRecurring: bill.frequency === 'one-time' ? false : !!bill.isExistingRecurring,
    });
    setIsBillFormDialogOpen(true);
  };

  const saveBillData = (data: BillFormData): boolean => {
    if (!data.nextDueDate) {
        toast({ title: "Error", description: "Next due date is required.", variant: "destructive" });
        return false;
    }

    if (editingBill) {
      const updatedBill: Bill = {
        ...editingBill,
        name: data.name,
        amount: Number(data.amount) || 0,
        nextDueDate: startOfDay(data.nextDueDate),
        frequency: data.frequency,
        isExistingRecurring: data.frequency === 'one-time' ? false : data.isExistingRecurring,
      };
      setBills(prevBills =>
        prevBills.map(b => b.id === editingBill.id ? updatedBill : b)
                 .sort((a, b) => getActualNextDueDate(a, new Date()).getTime() - getActualNextDueDate(b, new Date()).getTime())
      );
      toast({ title: "Bill Updated", description: `${updatedBill.name} has been updated.` });
    } else {
      const newBill: Bill = {
        id: Date.now().toString(),
        name: data.name,
        amount: Number(data.amount) || 0,
        nextDueDate: startOfDay(data.nextDueDate),
        frequency: data.frequency,
        isExistingRecurring: data.frequency === 'one-time' ? false : data.isExistingRecurring,
      };
      setBills(prevBills =>
        [...prevBills, newBill]
          .sort((a, b) => getActualNextDueDate(a, new Date()).getTime() - getActualNextDueDate(b, new Date()).getTime())
      );
      toast({ title: "Bill Added", description: `${newBill.name} has been added.` });
    }
    return true;
  };

  const handleSaveAndCloseDialog = async () => {
    billForm.handleSubmit((data) => {
      if (saveBillData(data)) {
        setIsBillFormDialogOpen(false);
        setEditingBill(null); // Also reset editingBill when closing
      }
    })();
  };

  const handleSaveAndAddAnother = async () => {
    billForm.handleSubmit((data) => {
      if (saveBillData(data)) {
        // Reset form for new entry, keep dialog open
        billForm.reset({
          name: '',
          amount: 0,
          nextDueDate: undefined,
          frequency: 'monthly',
          isExistingRecurring: false,
        });
      }
    })();
  };


  const handleDeleteBill = async (id: string) => {
    setBills(prev => prev.filter(bill => bill.id !== id));
    toast({ title: "Bill Deleted", description: "The bill has been removed." });
  };

  const handleSetPayPeriod: SubmitHandler<PayPeriodFormData> = async (data) => {
    if (!data.lastPayday) {
        toast({ title: "Error", description: "Last payday is required.", variant: "destructive" });
        return;
    }
    const newPayPeriodConfig: PayPeriodConfig = {
      payAmount: Number(data.payAmount) || 0,
      lastPayday: startOfDay(data.lastPayday),
      payFrequency: data.payFrequency,
    };
    setPayPeriodConfig(newPayPeriodConfig);

    toast({ title: "Pay Period Updated", description: "Your pay period configuration has been saved." });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-100px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const formatFrequency = (frequency: BillFrequency) => {
    switch (frequency) {
      case 'one-time': return 'One-Time';
      case 'weekly': return 'Weekly';
      case 'bi-weekly': return 'Bi-Weekly';
      case 'tri-weekly': return 'Every 3 Weeks';
      case 'monthly': return 'Monthly';
      default: return frequency;
    }
  };

  const getActualNextDueDate = (bill: Bill, todayDate: Date): Date => {
    if (bill.frequency === 'one-time') {
      return bill.nextDueDate;
    }

    let actualNextDueDate = startOfDay(bill.nextDueDate);
    const todayStart = startOfDay(todayDate);

    if (bill.isExistingRecurring) {
        if (isBefore(actualNextDueDate, todayStart)) {
            while(isBefore(actualNextDueDate, todayStart)) {
                const advancedDate = startOfDay(calculateNextOccurrence(actualNextDueDate, bill.frequency));
                if (isEqual(advancedDate, actualNextDueDate)) break;
                actualNextDueDate = advancedDate;
            }
        } else {
            while(true) {
                const prevDate = startOfDay(calculatePreviousOccurrence(actualNextDueDate, bill.frequency));
                if(isBefore(prevDate, todayStart) && !isEqual(prevDate,todayStart) && !isEqual(actualNextDueDate, todayStart)) {
                     if (isBefore(actualNextDueDate, todayStart)) {
                         actualNextDueDate = startOfDay(calculateNextOccurrence(prevDate, bill.frequency));
                     }
                     break;
                }
                if(isEqual(prevDate, actualNextDueDate)) break;
                actualNextDueDate = prevDate;
                if (isBefore(actualNextDueDate, new Date("1900-01-01"))) break;
            }
             if (isBefore(actualNextDueDate, todayStart)) {
                 actualNextDueDate = startOfDay(calculateNextOccurrence(actualNextDueDate, bill.frequency));
             }
        }
    } else {
        while (isBefore(actualNextDueDate, todayStart)) {
          const advancedDate = startOfDay(calculateNextOccurrence(actualNextDueDate, bill.frequency));
          if (isEqual(advancedDate, actualNextDueDate)) {
              break;
          }
          actualNextDueDate = advancedDate;
        }
    }
    return actualNextDueDate;
  };

  const todayForBillDisplay = startOfDay(new Date());
  const billsForDisplayInTable = bills
    .map(bill => ({
      ...bill,
      actualDisplayDueDate: getActualNextDueDate(bill, todayForBillDisplay),
    }))
    .sort((a, b) => a.actualDisplayDueDate.getTime() - b.actualDisplayDueDate.getTime());


  const displayedBillsDueInPayPeriod = showAllDueBills ? billsDueThisPayPeriod : billsDueThisPayPeriod.slice(0, 3);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="text-center space-y-2 mt-8">
        <div className="flex items-center justify-center gap-2">
           <Wallet className="h-10 w-10 text-primary" />
           <h1 className="text-4xl font-headline font-bold text-primary">Pocket Watch</h1>
        </div>
        <p className="text-muted-foreground">Track your finances and see what's left after bills.</p>
      </header>

      {leftoverMoney !== null && payPeriodConfig && currentPayPeriodDates && (
        <Card className="bg-accent text-accent-foreground shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center font-headline">Money Left This Pay Period</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-bold text-center" data-ai-hint="currency amount">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(leftoverMoney)}
            </p>
            {currentPayPeriodDates && (
               <p className="text-sm text-center mt-2">
                 For period: {format(currentPayPeriodDates.start, 'MMM d, yyyy')} - {format(addDays(currentPayPeriodDates.end, -1), 'MMM d, yyyy')}
               </p>
            )}
          </CardContent>
        </Card>
      )}

      {payPeriodConfig && billsDueThisPayPeriod.length > 0 && currentPayPeriodDates && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline mb-2">Bills Due This Pay Period</CardTitle>
            <CardDescription>
              These bills are scheduled between {format(currentPayPeriodDates.start, 'MMM d')} and {format(addDays(currentPayPeriodDates.end, -1), 'MMM d, yyyy')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {displayedBillsDueInPayPeriod.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedBillsDueInPayPeriod.map(bill => (
                    <TableRow key={bill.id + bill.nextDueDate.toISOString() + Math.random()}>
                      <TableCell className="font-medium">{bill.name}</TableCell>
                      <TableCell>{format(bill.nextDueDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bill.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-4">No bills due this pay period.</p>
            )}
          </CardContent>
          {billsDueThisPayPeriod.length > 3 && (
            <CardFooter className="flex justify-center">
              <Button variant="link" onClick={() => setShowAllDueBills(!showAllDueBills)}>
                {showAllDueBills ? 'Show Less' : `Show ${billsDueThisPayPeriod.length - 3} More`}
                {showAllDueBills ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      {monthlySummary && payPeriodConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline mb-2">Current Month Summary</CardTitle>
            <CardDescription>
              Estimated income and bills for {format(new Date(), 'MMMM yyyy')}. This is a calendar month overview.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Est. Monthly Income:</p>
              <p className="font-semibold text-lg text-accent" data-ai-hint="currency amount">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(monthlySummary.income)}
              </p>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Est. Monthly Bills:</p>
              <p className="font-semibold text-lg text-destructive" data-ai-hint="currency amount">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(monthlySummary.bills)}
              </p>
            </div>
            <hr className="my-2 border-border" />
            <div className="flex justify-between items-center">
              <p className="text-lg font-bold">Est. Net Monthly:</p>
              <p className={`text-2xl font-bold ${monthlySummary.net >= 0 ? 'text-accent' : 'text-destructive'}`} data-ai-hint="currency amount">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(monthlySummary.net)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

       {!payPeriodConfig && !isLoading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Setup Required!</AlertTitle>
          <AlertDescription>
            Please set up your pay period below to calculate your leftover money and see upcoming bills for your pay cycle.
          </AlertDescription>
        </Alert>
      )}

      <Accordion type="single" collapsible className="w-full">
         <AccordionItem value="payPeriodConfigAccordionItem" className="border-b-0">
            <Card>
                <AccordionTrigger className="w-full px-6 text-left hover:no-underline">
                    <CardHeader className="flex-1 p-0">
                        <CardTitle className="font-headline mb-2">Pay Period Configuration</CardTitle>
                        <CardDescription>Enter your pay amount, last payday, and how often you get paid.</CardDescription>
                    </CardHeader>
                </AccordionTrigger>
                <AccordionContent>
                    <CardContent>
                        <Form {...payPeriodForm}>
                        <form onSubmit={payPeriodForm.handleSubmit(handleSetPayPeriod)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField
                                control={payPeriodForm.control}
                                name="payAmount"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Pay Amount ($)</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g., 2000" {...field} value={field.value === null || field.value === undefined || field.value === 0 ? '' : field.value} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={payPeriodForm.control}
                                name="lastPayday"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Last Payday</FormLabel>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={(date) => date > new Date() || date < new Date("1900-01-01")} />
                                    </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={payPeriodForm.control}
                                name="payFrequency"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Pay Frequency</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                    </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            </div>
                            <Button type="submit" className="w-full md:w-auto">Save Pay Period</Button>
                        </form>
                        </Form>
                    </CardContent>
                </AccordionContent>
            </Card>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
            <div>
                <CardTitle className="font-headline mb-2">Manage Bills</CardTitle>
                <CardDescription>Add, edit, or remove your bills. Bills are sorted by their actual next due date.</CardDescription>
            </div>
            <Button onClick={handleOpenAddBillDialog}><PlusCircle className="mr-2 h-4 w-4" /> Add New Bill</Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {billsForDisplayInTable.length > 0 ? (
            <div className="mt-0">
              <h3 className="text-lg font-medium mb-2 sr-only">Your Bills List</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billsForDisplayInTable.map(bill => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">{bill.name}</TableCell>
                      <TableCell>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bill.amount)}</TableCell>
                      <TableCell>{format(bill.actualDisplayDueDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell>{formatFrequency(bill.frequency)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditBillDialog(bill)} aria-label="Edit bill">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteBill(bill.id)} aria-label="Delete bill">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center text-muted-foreground mt-6 py-8 border-2 border-dashed rounded-lg" data-ai-hint="empty state illustration">
              <Image src="https://placehold.co/300x200.png" alt="No bills" width={300} height={200} className="mx-auto mb-4 rounded" data-ai-hint="piggy bank savings" />
              <p>No bills added yet. Click "Add New Bill" to get started!</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isBillFormDialogOpen} onOpenChange={(isOpen) => {
          setIsBillFormDialogOpen(isOpen);
          if (!isOpen) {
              setEditingBill(null);
              billForm.reset({
                  name: '',
                  amount: 0,
                  nextDueDate: undefined,
                  frequency: 'monthly',
                  isExistingRecurring: false,
              });
          }
      }}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>{editingBill ? 'Edit Bill' : 'Add New Bill'}</DialogTitle>
            <DialogDescription>
              {editingBill ? 'Update the details of your bill.' : 'Enter the details for your new bill.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...billForm}>
            <form className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                    <FormField
                    control={billForm.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem className="lg:col-span-2">
                        <FormLabel>Bill Name</FormLabel>
                        <FormControl><Input placeholder="e.g., Rent, Netflix" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={billForm.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Amount ($)</FormLabel>
                        <FormControl><Input type="number" placeholder="e.g., 100" {...field} value={field.value === null || field.value === undefined || field.value === 0 ? '' : field.value}  onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={billForm.control}
                    name="nextDueDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Next Due Date / Start Date</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={(date) => date < startOfDay(new Date("1900-01-01"))} />
                            </PopoverContent>
                            </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={billForm.control}
                    name="frequency"
                    render={({ field }) => (
                        <FormItem className="lg:col-span-2">
                        <FormLabel>Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
                            <SelectContent>
                            <SelectItem value="one-time">One-Time</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                            <SelectItem value="tri-weekly">Every 3 Weeks</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    {selectedFrequency !== 'one-time' && (
                    <FormField
                        control={billForm.control}
                        name="isExistingRecurring"
                        render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow lg:col-span-2">
                            <FormControl>
                            <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                            <FormLabel>
                                Existing Recurring Bill?
                            </FormLabel>
                            <FormDescription>
                                Check if this bill has been paid before the 'Next Due Date / Start Date' entered. If unchecked, it's treated as a new bill starting on that date.
                            </FormDescription>
                            </div>
                        </FormItem>
                        )}
                    />
                    )}
                </div>
                <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsBillFormDialogOpen(false)}>
                    Cancel
                </Button>
                {!editingBill && (
                    <Button type="button" onClick={handleSaveAndAddAnother}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Save and Add Another
                    </Button>
                )}
                <Button type="button" onClick={handleSaveAndCloseDialog}>
                    {editingBill ? 'Save Changes' : 'Save and Close'}
                </Button>
                </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>


       <footer className="text-center text-sm text-muted-foreground mt-12 py-4 border-t">
        <p>&copy; {new Date().getFullYear()} Pocket Watch. Keep your finances in check.</p>
      </footer>
    </div>
  );
}

