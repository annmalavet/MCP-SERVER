import { server } from "./server.js";
import { Resend } from "resend";
import { z } from "zod"; // Kept for compatibility if used elsewhere

const kReg = Symbol.for("mcp.registered");
const g = globalThis as any;
const registered = (g[kReg] ??= new Set());

const resend = new Resend(process.env.RESEND_API_KEY);
const staticSearchUrl = process.env.EMAIL_SEARCH_API_URL;
const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL;

const createAppointmentSchema = {
    dateTime: z.string().datetime().describe("The appointment start time."),
    attendeeEmail: z.string().email().describe("The email of the person to invite."),
    durationInMinutes: z.number().int().positive().describe("The duration in minutes."),
};

const searchEmailsSchema = {
    query: z.string().min(1).describe("The text to search for in the email archive."),
};

const sendEmailSchema = {
    to: z.string().email().describe("The recipient's email address."),
    subject: z.string().min(1).describe("The subject line of the email."),
    body: z.string().min(1).describe("The plain text content of the email."),
};

function registerOnce(name: string, meta: any, handler: any) {
    if (registered.has(name)) return;
    server.registerTool(name, meta, handler);
    registered.add(name);
}

registerOnce(
    'search_emails',
    {
        title: 'Search Email Archive',
        description: 'Searches the static email archive for a query.',
        inputSchema: searchEmailsSchema, // Pass the Zod shape directly
    },
    async (params: any) => {
        console.error(`Tool 'search_emails' called with query: ${params.query}`);
        
        if (!staticSearchUrl) {
            return { content: [{ type: 'text', text: 'Error: The EMAIL_SEARCH_API_URL is not configured.' }] };
        }

        try {
            const query = params.query || '';
            const response = await fetch(`${staticSearchUrl}/search?q=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error(`Search service responded with status ${response.status}`);
            }

            const searchResults = await response.json();
            
            if (searchResults.length === 0) {
                 return { content: [{ type: 'text', text: "No emails found matching that query." }] };
            }

            const formattedResults = `Search found ${searchResults.length} results:\n` +
                searchResults.map((r: any) => `- ${r.subject} (from: ${r.from})`).join('\n');
            
                
            return { content: [{ type: 'text', text: formattedResults }] };

        } catch (e: any) {
            console.error(e);
            return { content: [{ type: 'text', text: `Error searching emails: ${e.message || String(e)}` }] };
        }
    }
);

registerOnce(
    'create_appointment', 
    {
        title: 'Create Appointment', 
        description: 'Books a new appointment with the doctor.',
        inputSchema: createAppointmentSchema,
    }, 
    async (params: any) => {
        console.error(`Tool 'create_appointment' called.`);
        
        if (!appointmentServiceUrl) {
            return { content: [{ type: 'text', text: 'Error: The url is not configured.' }] };
        }
        
        try {
            const response = await fetch(`${appointmentServiceUrl}/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_id: 'default-doc', 
                    date: params.dateTime.split('T')[0],
                    time: params.dateTime.split('T')[1],
                }),
            });

            if (!response.ok) {
                throw new Error(`Appointment service responded with status ${response.status}`);
            }

            const newAppointment = await response.json();
            const resultText = `Success! Appointment ${newAppointment.appointment_id} is ${newAppointment.status}.`;
            return { content: [{ type: 'text', text: resultText }] };

        } catch (e: any) {
            console.error(e);
            return { content: [{ type: 'text', text: `An unexpected error occurred: ${e.message || String(e)}` }] };
        }
    }
);

registerOnce(
    'send_email',
    {
        title: 'Send Email',
        description: 'Sends an email to a recipient.',
        inputSchema: sendEmailSchema,
    },
    async (params: any) => {
        console.error(`Tool 'send_email' called to: ${params.to}`);

        if (!process.env.RESEND_API_KEY) {
             return { content: [{ type: 'text', text: 'Error: key is not configured.' }] };
        }

        try {
            const { data, error } = await resend.emails.send({
                from: 'onboarding@resend.dev', 
                to: params.to,
                subject: params.subject,
                html: params.body, 
            });

            if (error) {
                console.error("Resend Error:", error);
                throw new Error(error.message);
            }

            return { content: [{ type: 'text', text: `Email sent successfully. ID: ${data?.id}` }] };

        } catch (e: any) {
            console.error(e);
            return { content: [{ type: 'text', text: `Error sending email: ${e.message || String(e)}` }] };
        }
    }
);