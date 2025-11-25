import { server } from "./server.js";
import { Resend } from "resend";
import { z } from "zod"; // Kept for compatibility if used elsewhere

const kReg = Symbol.for("mcp.registered");
const g = globalThis as any;
const registered = (g[kReg] ??= new Set());

const resend = new Resend(process.env.RESEND_API_KEY);
const staticSearchUrl = process.env.STATIC_SEARCH_API_URL;
const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL;

const createAppointmentSchema = {
    type: "object",
    properties: {
        dateTime: { 
            type: "string", 
            description: "The appointment start time." 
        },
        attendeeEmail: { 
            type: "string", 
            format: "email",
            description: "The email of the person to invite." 
        },
        durationInMinutes: { 
            type: "integer", 
            minimum: 1,
            description: "The duration in minutes." 
        },
    },
    required: ["dateTime", "attendeeEmail", "durationInMinutes"]
};

const searchEmailsSchema = {
    type: "object",
    properties: {
        query: { 
            type: "string", 
            description: "The text to search for in the email archive." 
        }
    },
    required: ["query"]
};

const sendEmailSchema = {
    type: "object",
    properties: {
        to: { 
            type: "string", 
            format: "email", 
            description: "The email address." 
        },
        subject: { 
            type: "string", 
            minLength: 1, 
            description: "The subject line." 
        },
        body: { 
            type: "string", 
            minLength: 1, 
            description: "The content of the email." 
        }
    },
    required: ["to", "subject", "body"]
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
        inputSchema: searchEmailsSchema as any, 
    },
    async (params: any) => {
        console.log(`Tool 'search_emails' called with query: ${params.query}`);
        
        if (!staticSearchUrl) {
            return { content: [{ type: 'text', text: 'Error: The STATIC_SEARCH_API_URL is not configured.' }] };
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
        inputSchema: createAppointmentSchema as any,
    }, 
    async (params: any) => {
        console.log(`Tool 'create_appointment' called.`);
        
        if (!appointmentServiceUrl) {
            return { content: [{ type: 'text', text: 'Error: The APPOINTMENT_SERVICE_URL is not configured.' }] };
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
        inputSchema: sendEmailSchema as any,
    },
    async (params: any) => {
        console.log(`Tool 'send_email' called to: ${params.to}`);

        if (!process.env.RESEND_API_KEY) {
             return { content: [{ type: 'text', text: 'Error: RESEND_API_KEY is not configured.' }] };
        }

        try {
            const { data, error } = await resend.emails.send({
                from: 'test@test.dev', 
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