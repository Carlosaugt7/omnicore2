-- Adds an option to send PIX key separately to the settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS send_pix_separately BOOLEAN DEFAULT false;
