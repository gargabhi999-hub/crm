-- CreateTable
CREATE TABLE "users" (
    "_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "tl_id" TEXT,
    "admin_id" TEXT,
    "receiver_mail" TEXT,
    "smtp_gmail" TEXT,
    "smtp_password" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "agent_work_logs" (
    "_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logout_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lunch_duration" INTEGER NOT NULL DEFAULT 0,
    "bio_duration" INTEGER NOT NULL DEFAULT 0,
    "tea_duration" INTEGER NOT NULL DEFAULT 0,
    "active_break_type" TEXT,
    "active_break_start" TIMESTAMP(3),
    "total_work_time" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_work_logs_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "_id" TEXT NOT NULL,
    "fields" JSONB,
    "batch_id" TEXT,
    "assigned_to" TEXT,
    "agent_name" TEXT,
    "admin_id" TEXT,
    "status" TEXT,
    "disposition" TEXT,
    "sub_disposition" TEXT,
    "remarks" TEXT,
    "queue_order" INTEGER,
    "call_attempts" INTEGER NOT NULL DEFAULT 0,
    "rechurn_count" INTEGER NOT NULL DEFAULT 0,
    "last_call_attempt" TIMESTAMP(3),
    "disposed_by" TEXT,
    "disposed_at" TIMESTAMP(3),
    "lead_amount" DOUBLE PRECISION,
    "transaction_id" TEXT,
    "appointment_dt" TIMESTAMP(3),
    "appointment_status" TEXT,
    "call_back_dt" TIMESTAMP(3),
    "conversion_date" TIMESTAMP(3),
    "utr_charity" TEXT,
    "charity_amount" DOUBLE PRECISION,
    "is_charity_confirmed" BOOLEAN DEFAULT false,
    "charity_confirmed_at" TIMESTAMP(3),
    "charity_confirmed_by" TEXT,
    "is_deleted" BOOLEAN DEFAULT false,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "cb_reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "late_notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "leads" (
    "_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "fields" JSONB,
    "batch_id" TEXT,
    "assigned_to" TEXT,
    "agent_name" TEXT,
    "admin_id" TEXT,
    "lead_amount" DOUBLE PRECISION,
    "transaction_id" TEXT,
    "utr_charity" TEXT,
    "charity_amount" DOUBLE PRECISION,
    "is_charity_confirmed" BOOLEAN DEFAULT false,
    "charity_confirmed_at" TIMESTAMP(3),
    "charity_confirmed_by" TEXT,
    "conversion_date" TIMESTAMP(3),
    "status" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "fields" JSONB,
    "batch_id" TEXT,
    "assigned_to" TEXT,
    "agent_name" TEXT,
    "admin_id" TEXT,
    "appointment_dt" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "callbacks" (
    "_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "fields" JSONB,
    "batch_id" TEXT,
    "assigned_to" TEXT,
    "agent_name" TEXT,
    "admin_id" TEXT,
    "call_back_dt" TIMESTAMP(3),
    "remarks" TEXT,
    "status" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "callbacks_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "batches" (
    "_id" TEXT NOT NULL,
    "name" TEXT,
    "admin_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "batches_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "agent_work_logs_user_id_idx" ON "agent_work_logs"("user_id");

-- CreateIndex
CREATE INDEX "agent_work_logs_login_at_idx" ON "agent_work_logs"("login_at");

-- CreateIndex
CREATE INDEX "contacts_assigned_to_idx" ON "contacts"("assigned_to");

-- CreateIndex
CREATE INDEX "contacts_created_at_idx" ON "contacts"("created_at");

-- CreateIndex
CREATE INDEX "contacts_batch_id_idx" ON "contacts"("batch_id");

-- CreateIndex
CREATE INDEX "contacts_is_deleted_idx" ON "contacts"("is_deleted");

-- CreateIndex
CREATE INDEX "contacts_disposition_idx" ON "contacts"("disposition");

-- CreateIndex
CREATE INDEX "contacts_appointment_dt_idx" ON "contacts"("appointment_dt");

-- CreateIndex
CREATE INDEX "contacts_call_back_dt_idx" ON "contacts"("call_back_dt");

-- CreateIndex
CREATE INDEX "contacts_conversion_date_idx" ON "contacts"("conversion_date");

-- CreateIndex
CREATE INDEX "contacts_is_charity_confirmed_idx" ON "contacts"("is_charity_confirmed");

-- CreateIndex
CREATE INDEX "contacts_assigned_to_is_deleted_created_at_idx" ON "contacts"("assigned_to", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "contacts_admin_id_is_deleted_created_at_idx" ON "contacts"("admin_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "contacts_assigned_to_is_deleted_queue_order_created_at_idx" ON "contacts"("assigned_to", "is_deleted", "queue_order", "created_at");

-- CreateIndex
CREATE INDEX "contacts_assigned_to_disposition_is_deleted_queue_order_cal_idx" ON "contacts"("assigned_to", "disposition", "is_deleted", "queue_order", "call_back_dt");

-- CreateIndex
CREATE INDEX "contacts_disposition_is_deleted_created_at_idx" ON "contacts"("disposition", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "contacts_status_is_deleted_idx" ON "contacts"("status", "is_deleted");

-- CreateIndex
CREATE INDEX "contacts_disposed_at_idx" ON "contacts"("disposed_at");

-- CreateIndex
CREATE INDEX "contacts_disposition_is_deleted_last_modified_idx" ON "contacts"("disposition", "is_deleted", "last_modified");

-- CreateIndex
CREATE INDEX "contacts_disposition_is_deleted_status_last_modified_idx" ON "contacts"("disposition", "is_deleted", "status", "last_modified");

-- CreateIndex
CREATE INDEX "contacts_disposition_is_deleted_batch_id_last_modified_idx" ON "contacts"("disposition", "is_deleted", "batch_id", "last_modified");

-- CreateIndex
CREATE INDEX "contacts_disposition_is_deleted_conversion_date_idx" ON "contacts"("disposition", "is_deleted", "conversion_date");

-- CreateIndex
CREATE INDEX "leads_assigned_to_idx" ON "leads"("assigned_to");

-- CreateIndex
CREATE INDEX "leads_admin_id_idx" ON "leads"("admin_id");

-- CreateIndex
CREATE INDEX "leads_contact_id_idx" ON "leads"("contact_id");

-- CreateIndex
CREATE INDEX "leads_transaction_id_idx" ON "leads"("transaction_id");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "leads_conversion_date_idx" ON "leads"("conversion_date");

-- CreateIndex
CREATE INDEX "leads_is_charity_confirmed_idx" ON "leads"("is_charity_confirmed");

-- CreateIndex
CREATE INDEX "leads_assigned_to_created_at_idx" ON "leads"("assigned_to", "created_at");

-- CreateIndex
CREATE INDEX "leads_admin_id_created_at_idx" ON "leads"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_status_last_modified_idx" ON "leads"("status", "last_modified");

-- CreateIndex
CREATE INDEX "leads_batch_id_last_modified_idx" ON "leads"("batch_id", "last_modified");

-- CreateIndex
CREATE INDEX "appointments_assigned_to_idx" ON "appointments"("assigned_to");

-- CreateIndex
CREATE INDEX "appointments_admin_id_idx" ON "appointments"("admin_id");

-- CreateIndex
CREATE INDEX "appointments_contact_id_idx" ON "appointments"("contact_id");

-- CreateIndex
CREATE INDEX "appointments_appointment_dt_idx" ON "appointments"("appointment_dt");

-- CreateIndex
CREATE INDEX "appointments_assigned_to_appointment_dt_idx" ON "appointments"("assigned_to", "appointment_dt");

-- CreateIndex
CREATE INDEX "appointments_admin_id_appointment_dt_idx" ON "appointments"("admin_id", "appointment_dt");

-- CreateIndex
CREATE INDEX "callbacks_assigned_to_idx" ON "callbacks"("assigned_to");

-- CreateIndex
CREATE INDEX "callbacks_admin_id_idx" ON "callbacks"("admin_id");

-- CreateIndex
CREATE INDEX "callbacks_contact_id_idx" ON "callbacks"("contact_id");

-- CreateIndex
CREATE INDEX "callbacks_call_back_dt_idx" ON "callbacks"("call_back_dt");

-- CreateIndex
CREATE INDEX "callbacks_assigned_to_call_back_dt_idx" ON "callbacks"("assigned_to", "call_back_dt");

-- CreateIndex
CREATE INDEX "callbacks_admin_id_call_back_dt_idx" ON "callbacks"("admin_id", "call_back_dt");

-- AddForeignKey
ALTER TABLE "agent_work_logs" ADD CONSTRAINT "agent_work_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("_id") ON DELETE CASCADE ON UPDATE CASCADE;
