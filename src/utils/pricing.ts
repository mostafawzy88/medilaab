export type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  accounts: number | 'Unlimited';
  discount: number;
  features: string[];
  color: string;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Basic Plan',
    price: 500,
    accounts: 1,
    discount: 0,
    features: [
      'Core Clinic Dashboard',
      'Basic Queue Management',
      'Patient Records',
      'Prescription Printing'
    ],
    color: 'blue'
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 1200,
    accounts: 5,
    discount: 10,
    features: [
      'Everything in Basic',
      'Up to 5 Staff Accounts',
      'Advanced Patient Analytics',
      'Custom Financial Reports',
      'Automated Reminders'
    ],
    color: 'teal'
  },
  {
    id: 'elite',
    name: 'Elite Clinic',
    price: 3000,
    accounts: 'Unlimited',
    discount: 25,
    features: [
      'Everything in Pro',
      'Unlimited Staff Accounts',
      'White-label Branding',
      'Multi-Clinic Support',
      'Priority 24/7 Support',
      'Premium Custom Website'
    ],
    color: 'purple'
  }
];

export const getPlanById = (id: string) => 
  SUBSCRIPTION_PLANS.find(p => p.id === id) || SUBSCRIPTION_PLANS[0];
